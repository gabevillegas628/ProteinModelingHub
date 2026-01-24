import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { SubmissionStatus } from '@prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// All instructor routes require authentication and INSTRUCTOR role
router.use(authenticate);
router.use(requireRole('INSTRUCTOR'));

// Upload directories
const UPLOAD_BASE = path.join(process.cwd(), 'uploads');
const MODELS_DIR = path.join(UPLOAD_BASE, 'models');
const LITERATURE_DIR = path.join(UPLOAD_BASE, 'literature');

// ============================================
// GROUPS
// ============================================

// Get all groups (instructors can see all groups)
router.get('/groups', async (_req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      orderBy: { name: 'asc' }
    });

    // Get submission counts for each group
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        const submissionCount = await prisma.submission.count({
          where: { groupId: group.id }
        });
        const pendingCount = await prisma.submission.count({
          where: { groupId: group.id, status: 'SUBMITTED' }
        });
        const memberCount = await prisma.groupMember.count({
          where: { groupId: group.id }
        });

        return {
          ...group,
          submissionCount,
          pendingCount,
          memberCount
        };
      })
    );

    res.json(groupsWithStats);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get single group details
router.get('/groups/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, role: true }
            }
          }
        }
      }
    });

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    res.json(group);
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// ============================================
// SUBMISSIONS
// ============================================

// Get all submissions for a group
router.get('/groups/:groupId/submissions', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;

    // Verify group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    // Get all model templates
    const templates = await prisma.modelTemplate.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' }
    });

    // Get all submissions for this group
    const submissions = await prisma.submission.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: {
        submittedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    // Map templates with their submissions
    const modelsWithSubmissions = templates.map(template => {
      const submission = submissions.find(s => s.modelTemplateId === template.id);
      return {
        ...template,
        submission: submission || null
      };
    });

    res.json(modelsWithSubmissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Get submission file
router.get('/submissions/file/:submissionId', async (req: AuthRequest, res: Response) => {
  try {
    const submissionId = req.params.submissionId as string;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId }
    });

    if (!submission) {
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
    console.error('Error fetching submission file:', error);
    res.status(500).json({ error: 'Failed to fetch submission file' });
  }
});

// Update submission status/feedback
router.patch('/submissions/:submissionId', async (req: AuthRequest, res: Response) => {
  try {
    const submissionId = req.params.submissionId as string;
    const { status, feedback } = req.body;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId }
    });

    if (!submission) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }

    const updateData: { status?: SubmissionStatus; feedback?: string } = {};
    if (status && Object.values(SubmissionStatus).includes(status)) {
      updateData.status = status as SubmissionStatus;
    }
    if (feedback !== undefined) updateData.feedback = feedback;

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: updateData,
      include: {
        submittedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating submission:', error);
    res.status(500).json({ error: 'Failed to update submission' });
  }
});

// ============================================
// LITERATURE
// ============================================

// Get all literature for a group
router.get('/groups/:groupId/literature', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;

    // Verify group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    const literature = await prisma.literature.findMany({
      where: { groupId },
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

// Get literature file
router.get('/literature/file/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const literature = await prisma.literature.findUnique({
      where: { id }
    });

    if (!literature) {
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

export default router;
