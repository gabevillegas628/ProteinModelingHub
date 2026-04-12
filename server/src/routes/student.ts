import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { sendReviewRequestEmail } from '../services/emailService.js';

const router = Router();

// All student routes require authentication and STUDENT role
router.use(authenticate);
router.use(requireRole('STUDENT'));

// Configure upload directories
const UPLOAD_BASE = path.join(process.cwd(), 'uploads');
const MODELS_DIR = path.join(UPLOAD_BASE, 'models');
const LITERATURE_DIR = path.join(UPLOAD_BASE, 'literature');
const PRESENTATIONS_DIR = path.join(UPLOAD_BASE, 'presentations');

// Ensure directories exist
[UPLOAD_BASE, MODELS_DIR, LITERATURE_DIR, PRESENTATIONS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for model uploads (JPG files)
const modelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MODELS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const modelUpload = multer({
  storage: modelStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG files are allowed for models'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure multer for literature uploads (PDF files)
const literatureStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LITERATURE_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const literatureUpload = multer({
  storage: literatureStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for literature'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Count slides in a PPTX file (PPTX is a ZIP; slides are ppt/slides/slide*.xml)
function countSlides(filePath: string): number | null {
  try {
    const zip = new AdmZip(filePath);
    return zip.getEntries().filter(e =>
      /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName)
    ).length || null;
  } catch {
    return null;
  }
}

// Helper to get student's group
async function getStudentGroup(userId: string) {
  const membership = await prisma.groupMember.findFirst({
    where: { userId },
    include: { group: true }
  });
  return membership?.group;
}

// ============================================
// GROUP INFO
// ============================================

// Get student's group info
router.get('/group', async (req: AuthRequest, res: Response) => {
  try {
    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }
    res.json(group);
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// Update group protein info
router.put('/group', async (req: AuthRequest, res: Response) => {
  try {
    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const { proteinPdbId, proteinName } = req.body;

    // Validate PDB ID format (4 characters, alphanumeric)
    if (proteinPdbId !== undefined) {
      if (typeof proteinPdbId !== 'string' || !/^[a-zA-Z0-9]{4}$/.test(proteinPdbId)) {
        res.status(400).json({ error: 'PDB ID must be exactly 4 alphanumeric characters (e.g., 1ABC)' });
        return;
      }
    }

    // Validate protein name
    if (proteinName !== undefined) {
      if (typeof proteinName !== 'string' || proteinName.trim().length === 0) {
        res.status(400).json({ error: 'Protein name cannot be empty' });
        return;
      }
      if (proteinName.length > 100) {
        res.status(400).json({ error: 'Protein name must be 100 characters or less' });
        return;
      }
    }

    const updatedGroup = await prisma.group.update({
      where: { id: group.id },
      data: {
        ...(proteinPdbId !== undefined && { proteinPdbId: proteinPdbId.toUpperCase() }),
        ...(proteinName !== undefined && { proteinName: proteinName.trim() })
      }
    });

    res.json(updatedGroup);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// ============================================
// MODEL TEMPLATES & SUBMISSIONS
// ============================================

// Get all active model templates with student's submissions
router.get('/models', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const group = await getStudentGroup(userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    // Get all active model templates
    const templates = await prisma.modelTemplate.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' }
    });

    // Get latest submission for each template for this group
    const submissions = await prisma.submission.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: 'desc' }
    });

    // Get user's read status for all submissions in this group
    const readStatuses = await prisma.messageReadStatus.findMany({
      where: {
        userId,
        groupId: group.id,
        submissionId: { not: null }
      }
    });

    // Map templates with their latest submission and unread counts
    const modelsWithSubmissions = await Promise.all(templates.map(async template => {
      const submission = submissions.find(s => s.modelTemplateId === template.id);

      let unreadCount = 0;
      if (submission) {
        const readStatus = readStatuses.find(rs => rs.submissionId === submission.id);

        // Count unread messages for this submission
        unreadCount = await prisma.message.count({
          where: {
            submissionId: submission.id,
            ...(readStatus ? { createdAt: { gt: readStatus.lastReadAt } } : {})
          }
        });
      }

      return {
        ...template,
        submission: submission ? { ...submission, unreadCount } : null
      };
    }));

    res.json({
      group,
      models: modelsWithSubmissions
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// Upload/replace a model submission
router.post('/models/:templateId/upload', modelUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const templateId = req.params.templateId as string;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    // Verify template exists and is active
    const template = await prisma.modelTemplate.findUnique({
      where: { id: templateId }
    });
    if (!template || !template.isActive) {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
      res.status(404).json({ error: 'Model template not found' });
      return;
    }

    // Check lockout
    if (template.unlocksAt && new Date() < template.unlocksAt) {
      fs.unlinkSync(file.path);
      res.status(403).json({ error: `This model is locked until ${template.unlocksAt.toISOString()}` });
      return;
    }

    // Find existing submission for this template
    const existingSubmission = await prisma.submission.findFirst({
      where: {
        groupId: group.id,
        modelTemplateId: templateId
      },
      orderBy: { createdAt: 'desc' }
    });

    // Prevent upload if submission is locked (under review or approved)
    if (existingSubmission && (existingSubmission.status === 'SUBMITTED' || existingSubmission.status === 'APPROVED')) {
      fs.unlinkSync(file.path);
      res.status(403).json({ error: 'This submission is locked. Withdraw it before making changes.' });
      return;
    }

    let submission;

    if (existingSubmission) {
      // Delete old file if exists
      if (existingSubmission.filePath) {
        const oldPath = path.join(MODELS_DIR, existingSubmission.filePath);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Update existing submission — preserve current status (DRAFT or NEEDS_REVISION)
      submission = await prisma.submission.update({
        where: { id: existingSubmission.id },
        data: {
          submittedById: req.user!.userId,
          fileName: file.originalname,
          filePath: file.filename,
          fileSize: file.size,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new submission as DRAFT
      submission = await prisma.submission.create({
        data: {
          groupId: group.id,
          modelTemplateId: templateId,
          submittedById: req.user!.userId,
          fileName: file.originalname,
          filePath: file.filename,
          fileSize: file.size,
          status: 'DRAFT'
        }
      });
    }

    res.status(201).json(submission);
  } catch (error) {
    console.error('Error uploading model:', error);
    res.status(500).json({ error: 'Failed to upload model' });
  }
});

// Get model file (accepts optional .png extension for JSmol compatibility)
router.get('/models/file/:submissionId', async (req: AuthRequest, res: Response) => {
  try {
    // Strip .png extension if present (added for JSmol file type detection)
    const submissionId = (req.params.submissionId as string).replace(/\.png$/, '');

    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId }
    });

    if (!submission || submission.groupId !== group.id) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }

    const filePath = path.join(MODELS_DIR, submission.filePath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Error fetching model file:', error);
    res.status(500).json({ error: 'Failed to fetch model file' });
  }
});

// Replace submission file with new PNGJ
router.put('/models/:submissionId/replace', modelUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const submissionId = req.params.submissionId as string;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      fs.unlinkSync(file.path);
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    // Find existing submission
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId }
    });

    if (!submission || submission.groupId !== group.id) {
      fs.unlinkSync(file.path);
      res.status(404).json({ error: 'Submission not found' });
      return;
    }

    // Prevent replace if submission is locked
    if (submission.status === 'SUBMITTED' || submission.status === 'APPROVED') {
      fs.unlinkSync(file.path);
      res.status(403).json({ error: 'This submission is locked. Withdraw it before making changes.' });
      return;
    }

    // Delete old file
    const oldPath = path.join(MODELS_DIR, submission.filePath);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }

    // Update submission with new file
    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        fileName: file.originalname,
        filePath: file.filename,
        fileSize: file.size,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    res.json(updatedSubmission);
  } catch (error) {
    console.error('Error replacing submission:', error);
    res.status(500).json({ error: 'Failed to replace submission' });
  }
});

// Submit a draft/revision for review (DRAFT | NEEDS_REVISION → SUBMITTED)
router.post('/models/:templateId/submit', async (req: AuthRequest, res: Response) => {
  try {
    const templateId = req.params.templateId as string;
    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const submission = await prisma.submission.findFirst({
      where: { groupId: group.id, modelTemplateId: templateId },
      orderBy: { createdAt: 'desc' }
    });

    if (!submission) {
      res.status(404).json({ error: 'No submission found for this template' });
      return;
    }

    if (submission.status !== 'DRAFT' && submission.status !== 'NEEDS_REVISION') {
      res.status(400).json({ error: 'Submission is not in a submittable state' });
      return;
    }

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: { status: 'SUBMITTED', updatedAt: new Date() }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error submitting model:', error);
    res.status(500).json({ error: 'Failed to submit model' });
  }
});

// Withdraw a submitted model back to draft (SUBMITTED → DRAFT)
router.post('/models/:submissionId/withdraw', async (req: AuthRequest, res: Response) => {
  try {
    const submissionId = req.params.submissionId as string;
    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId }
    });

    if (!submission || submission.groupId !== group.id) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }

    if (submission.status !== 'SUBMITTED') {
      res.status(400).json({ error: 'Only submitted models can be withdrawn' });
      return;
    }

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'DRAFT', updatedAt: new Date() }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error withdrawing model:', error);
    res.status(500).json({ error: 'Failed to withdraw model' });
  }
});

// Reset a submission back to DRAFT from any locked status (SUBMITTED or APPROVED)
router.post('/models/:submissionId/reset', async (req: AuthRequest, res: Response) => {
  try {
    const submissionId = req.params.submissionId as string;
    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId }
    });

    if (!submission || submission.groupId !== group.id) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }

    if (submission.status === 'DRAFT') {
      res.status(400).json({ error: 'Submission is already a draft' });
      return;
    }

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'DRAFT', feedback: null, updatedAt: new Date() }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error resetting model:', error);
    res.status(500).json({ error: 'Failed to reset model' });
  }
});

// ============================================
// LITERATURE
// ============================================

// Get all literature for group
router.get('/literature', async (req: AuthRequest, res: Response) => {
  try {
    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const literature = await prisma.literature.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    res.json(literature);
  } catch (error) {
    console.error('Error fetching literature:', error);
    res.status(500).json({ error: 'Failed to fetch literature' });
  }
});

// Upload literature
router.post('/literature', literatureUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    const { title, description } = req.body;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    if (!title) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      fs.unlinkSync(file.path);
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const literature = await prisma.literature.create({
      data: {
        groupId: group.id,
        uploadedById: req.user!.userId,
        title,
        description,
        fileName: file.originalname,
        filePath: file.filename,
        fileSize: file.size
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    res.status(201).json(literature);
  } catch (error) {
    console.error('Error uploading literature:', error);
    res.status(500).json({ error: 'Failed to upload literature' });
  }
});

// Get literature file (PDF)
router.get('/literature/file/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const literature = await prisma.literature.findUnique({
      where: { id }
    });

    if (!literature || literature.groupId !== group.id) {
      res.status(404).json({ error: 'Literature not found' });
      return;
    }

    const filePath = path.join(LITERATURE_DIR, literature.filePath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${literature.fileName}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error fetching literature file:', error);
    res.status(500).json({ error: 'Failed to fetch literature file' });
  }
});

// Delete literature
router.delete('/literature/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const literature = await prisma.literature.findUnique({
      where: { id }
    });

    if (!literature || literature.groupId !== group.id) {
      res.status(404).json({ error: 'Literature not found' });
      return;
    }

    // Delete file
    const filePath = path.join(LITERATURE_DIR, literature.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete record
    await prisma.literature.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting literature:', error);
    res.status(500).json({ error: 'Failed to delete literature' });
  }
});

// ============================================
// Presentations
// ============================================

const presentationStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PRESENTATIONS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const presentationUpload = multer({
  storage: presentationStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.ppt' || ext === '.pptx') {
      cb(null, true);
    } else {
      cb(new Error('Only PPT and PPTX files are allowed for presentations'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Get all presentations for group
router.get('/presentations', async (req: AuthRequest, res: Response) => {
  try {
    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const presentations = await prisma.presentation.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    res.json(presentations);
  } catch (error) {
    console.error('Error fetching presentations:', error);
    res.status(500).json({ error: 'Failed to fetch presentations' });
  }
});

// Upload presentation
router.post('/presentations', presentationUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    const { title, description } = req.body;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    if (!title) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      fs.unlinkSync(file.path);
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const slideCount = countSlides(file.path);

    const presentation = await prisma.presentation.create({
      data: {
        groupId: group.id,
        uploadedById: req.user!.userId,
        title,
        description,
        fileName: file.originalname,
        filePath: file.filename,
        fileSize: file.size,
        slideCount
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    res.status(201).json(presentation);
  } catch (error) {
    console.error('Error uploading presentation:', error);
    res.status(500).json({ error: 'Failed to upload presentation' });
  }
});

// Download presentation file
router.get('/presentations/file/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const presentation = await prisma.presentation.findUnique({
      where: { id }
    });

    if (!presentation || presentation.groupId !== group.id) {
      res.status(404).json({ error: 'Presentation not found' });
      return;
    }

    const filePath = path.join(PRESENTATIONS_DIR, presentation.filePath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${presentation.fileName}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error fetching presentation file:', error);
    res.status(500).json({ error: 'Failed to fetch presentation file' });
  }
});

// Delete presentation
router.delete('/presentations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    const presentation = await prisma.presentation.findUnique({
      where: { id }
    });

    if (!presentation || presentation.groupId !== group.id) {
      res.status(404).json({ error: 'Presentation not found' });
      return;
    }

    const filePath = path.join(PRESENTATIONS_DIR, presentation.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.presentation.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting presentation:', error);
    res.status(500).json({ error: 'Failed to delete presentation' });
  }
});

// ============================================
// Review Request
// ============================================

const REVIEW_COOLDOWN_HOURS = 1;

// Request instructor review
router.post('/request-review', async (req: AuthRequest, res: Response) => {
  try {
    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    // Check cooldown
    if (group.lastReviewRequestedAt) {
      const hoursSinceLastRequest =
        (Date.now() - new Date(group.lastReviewRequestedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRequest < REVIEW_COOLDOWN_HOURS) {
        const minutesRemaining = Math.ceil((REVIEW_COOLDOWN_HOURS - hoursSinceLastRequest) * 60);
        res.status(429).json({
          error: `Please wait ${minutesRemaining} more minute${minutesRemaining !== 1 ? 's' : ''} before requesting another review.`,
          cooldownEndsAt: new Date(
            new Date(group.lastReviewRequestedAt).getTime() + REVIEW_COOLDOWN_HOURS * 60 * 60 * 1000
          ).toISOString()
        });
        return;
      }
    }

    // Get group members (student names)
    const members = await prisma.groupMember.findMany({
      where: { groupId: group.id },
      include: {
        user: {
          select: { firstName: true, lastName: true }
        }
      }
    });
    const studentNames = members.map(m => `${m.user.firstName} ${m.user.lastName}`);

    // Get all submissions for this group with their model templates
    const submissions = await prisma.submission.findMany({
      where: { groupId: group.id },
      include: {
        modelTemplate: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get unique submissions per template (latest only)
    const latestByTemplate = new Map<string, typeof submissions[0]>();
    for (const sub of submissions) {
      if (!latestByTemplate.has(sub.modelTemplateId)) {
        latestByTemplate.set(sub.modelTemplateId, sub);
      }
    }
    const uniqueSubmissions = Array.from(latestByTemplate.values());

    if (uniqueSubmissions.length === 0) {
      res.status(400).json({ error: 'No submissions to review. Please upload at least one model first.' });
      return;
    }

    // Get all instructors
    const instructors = await prisma.user.findMany({
      where: {
        role: 'INSTRUCTOR',
        isApproved: true
      },
      select: { email: true, firstName: true, lastName: true }
    });

    if (instructors.length === 0) {
      res.status(500).json({ error: 'No instructors available to notify.' });
      return;
    }

    // Build frontend URL for the dashboard
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const dashboardUrl = `${frontendUrl}/dashboard`;

    // Format submissions for email
    const submissionInfo = uniqueSubmissions.map(s => ({
      modelName: s.modelTemplate.name,
      status: s.status as 'DRAFT' | 'SUBMITTED' | 'NEEDS_REVISION' | 'APPROVED',
      fileName: s.fileName,
      submittedAt: s.createdAt.toISOString()
    }));

    // Send email to each instructor
    const emailPromises = instructors.map(instructor =>
      sendReviewRequestEmail({
        instructorEmail: instructor.email,
        instructorName: `${instructor.firstName} ${instructor.lastName}`,
        groupName: group.name,
        proteinName: group.proteinName,
        proteinPdbId: group.proteinPdbId,
        studentNames,
        submissions: submissionInfo,
        dashboardUrl
      })
    );

    const results = await Promise.all(emailPromises);
    const successCount = results.filter(r => r).length;

    // Update the last review requested timestamp
    await prisma.group.update({
      where: { id: group.id },
      data: { lastReviewRequestedAt: new Date() }
    });

    res.json({
      success: true,
      message: `Review request sent to ${successCount} instructor${successCount !== 1 ? 's' : ''}.`,
      lastReviewRequestedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error requesting review:', error);
    res.status(500).json({ error: 'Failed to send review request' });
  }
});

// Get review request status (for showing cooldown in UI)
router.get('/review-status', async (req: AuthRequest, res: Response) => {
  try {
    const group = await getStudentGroup(req.user!.userId);
    if (!group) {
      res.status(404).json({ error: 'You are not assigned to a group' });
      return;
    }

    let canRequest = true;
    let cooldownEndsAt: string | null = null;

    if (group.lastReviewRequestedAt) {
      const hoursSinceLastRequest =
        (Date.now() - new Date(group.lastReviewRequestedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRequest < REVIEW_COOLDOWN_HOURS) {
        canRequest = false;
        cooldownEndsAt = new Date(
          new Date(group.lastReviewRequestedAt).getTime() + REVIEW_COOLDOWN_HOURS * 60 * 60 * 1000
        ).toISOString();
      }
    }

    res.json({
      lastReviewRequestedAt: group.lastReviewRequestedAt?.toISOString() || null,
      canRequest,
      cooldownEndsAt
    });
  } catch (error) {
    console.error('Error getting review status:', error);
    res.status(500).json({ error: 'Failed to get review status' });
  }
});

export default router;
