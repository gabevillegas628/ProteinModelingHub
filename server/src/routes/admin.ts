import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

// File storage paths
const UPLOAD_BASE = path.join(process.cwd(), 'uploads');
const MODELS_DIR = path.join(UPLOAD_BASE, 'models');
const LITERATURE_DIR = path.join(UPLOAD_BASE, 'literature');

// Store confirmation codes temporarily (in production, use Redis or similar)
const confirmationCodes = new Map<string, { code: string; expiresAt: Date }>();

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(authenticate);
router.use(requireRole('ADMIN'));

// ============================================
// MODEL TEMPLATES
// ============================================

// Get all model templates
router.get('/model-templates', async (req: Request, res: Response) => {
  try {
    const templates = await prisma.modelTemplate.findMany({
      orderBy: { orderIndex: 'asc' },
    });
    res.json(templates);
  } catch (error) {
    console.error('Error fetching model templates:', error);
    res.status(500).json({ error: 'Failed to fetch model templates' });
  }
});

// Create model template
router.post('/model-templates', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    // Get the highest orderIndex
    const lastTemplate = await prisma.modelTemplate.findFirst({
      orderBy: { orderIndex: 'desc' },
    });
    const orderIndex = (lastTemplate?.orderIndex ?? -1) + 1;

    const template = await prisma.modelTemplate.create({
      data: { name, description, orderIndex },
    });
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating model template:', error);
    res.status(500).json({ error: 'Failed to create model template' });
  }
});

// Update model template
router.put('/model-templates/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, orderIndex, isActive } = req.body;

    const template = await prisma.modelTemplate.update({
      where: { id },
      data: { name, description, orderIndex, isActive },
    });
    res.json(template);
  } catch (error) {
    console.error('Error updating model template:', error);
    res.status(500).json({ error: 'Failed to update model template' });
  }
});

// Delete model template
router.delete('/model-templates/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.modelTemplate.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting model template:', error);
    res.status(500).json({ error: 'Failed to delete model template' });
  }
});

// Reorder model templates
router.post('/model-templates/reorder', async (req: Request, res: Response) => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };

    await Promise.all(
      orderedIds.map((id, index) =>
        prisma.modelTemplate.update({
          where: { id },
          data: { orderIndex: index },
        })
      )
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering model templates:', error);
    res.status(500).json({ error: 'Failed to reorder model templates' });
  }
});

// ============================================
// GROUPS
// ============================================

// Get all groups with members
router.get('/groups', async (req: Request, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Create group
router.post('/groups', async (req: Request, res: Response) => {
  try {
    const { name, proteinPdbId, proteinName } = req.body;

    const group = await prisma.group.create({
      data: { name, proteinPdbId, proteinName },
    });
    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update group
router.put('/groups/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, proteinPdbId, proteinName } = req.body;

    const group = await prisma.group.update({
      where: { id },
      data: { name, proteinPdbId, proteinName },
    });
    res.json(group);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Delete group
router.delete('/groups/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.group.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// Add member to group
router.post('/groups/:id/members', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { userId } = req.body;

    const member = await prisma.groupMember.create({
      data: { groupId: id, userId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
    res.status(201).json(member);
  } catch (error) {
    console.error('Error adding group member:', error);
    res.status(500).json({ error: 'Failed to add member to group' });
  }
});

// Remove member from group
router.delete('/groups/:groupId/members/:userId', async (req: Request, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const userId = req.params.userId as string;

    await prisma.groupMember.deleteMany({
      where: { groupId, userId },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing group member:', error);
    res.status(500).json({ error: 'Failed to remove member from group' });
  }
});

// Upload groups from CSV
// Expected format: name,proteinPdbId,proteinName (one per line, with header row)
router.post('/groups/upload-csv', async (req: Request, res: Response) => {
  try {
    const { csvData } = req.body as { csvData: string };

    if (!csvData) {
      res.status(400).json({ error: 'No CSV data provided' });
      return;
    }

    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
      return;
    }

    // Parse header to find column indices
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = header.findIndex(h => h === 'name' || h === 'group' || h === 'group name');
    const pdbIdIdx = header.findIndex(h => h === 'pdbid' || h === 'proteinpdbid' || h === 'pdb id' || h === 'pdb');
    const proteinNameIdx = header.findIndex(h => h === 'proteinname' || h === 'protein name' || h === 'protein');

    if (nameIdx === -1 || pdbIdIdx === -1 || proteinNameIdx === -1) {
      res.status(400).json({
        error: 'CSV must have columns: name (or "group"), proteinPdbId (or "pdb"), proteinName (or "protein")'
      });
      return;
    }

    const groups: { name: string; proteinPdbId: string; proteinName: string }[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',').map(c => c.trim());
      const name = cols[nameIdx];
      const proteinPdbId = cols[pdbIdIdx]?.toUpperCase();
      const proteinName = cols[proteinNameIdx];

      if (!name || !proteinPdbId || !proteinName) {
        errors.push(`Row ${i + 1}: Missing required field(s)`);
        continue;
      }

      groups.push({ name, proteinPdbId, proteinName });
    }

    if (groups.length === 0) {
      res.status(400).json({ error: 'No valid groups found in CSV', details: errors });
      return;
    }

    // Create all groups
    const created = await prisma.group.createMany({
      data: groups,
      skipDuplicates: true,
    });

    res.status(201).json({
      success: true,
      created: created.count,
      total: groups.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error uploading groups CSV:', error);
    res.status(500).json({ error: 'Failed to upload groups' });
  }
});

// ============================================
// USERS
// ============================================

// Get all users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isApproved: true,
        createdAt: true,
        groupMemberships: {
          include: {
            group: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get pending approval users
router.get('/users/pending', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { isApproved: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
});

// Approve user
router.post('/users/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const user = await prisma.user.update({
      where: { id },
      data: { isApproved: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isApproved: true,
      },
    });
    res.json(user);
  } catch (error) {
    console.error('Error approving user:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// Update user
router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { email, firstName, lastName, role, isApproved, password } = req.body;

    const updateData: Record<string, unknown> = {};
    if (email !== undefined) updateData.email = email;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) updateData.role = role;
    if (isApproved !== undefined) updateData.isApproved = isApproved;
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isApproved: true,
      },
    });
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    // Prevent self-deletion
    if (req.user?.userId === id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================
// NUCLEAR RESET
// ============================================

// Helper to count files in a directory
function countFilesInDir(dirPath: string): number {
  try {
    if (!fs.existsSync(dirPath)) return 0;
    return fs.readdirSync(dirPath).filter(f => !f.startsWith('.')).length;
  } catch {
    return 0;
  }
}

// Helper to sanitize folder/file names
function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
}

// Preview what will be deleted/preserved
router.get('/nuclear-reset/preview', async (req: AuthRequest, res: Response) => {
  try {
    // Count what will be deleted
    const [groups, students, submissions, messages, literature] = await Promise.all([
      prisma.group.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.submission.count(),
      prisma.message.count(),
      prisma.literature.count(),
    ]);

    // Count files on disk
    const modelFiles = countFilesInDir(MODELS_DIR);
    const literatureFiles = countFilesInDir(LITERATURE_DIR);
    const filesOnDisk = modelFiles + literatureFiles;

    // Count what will be preserved
    const [admins, instructors, modelTemplates] = await Promise.all([
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'INSTRUCTOR' } }),
      prisma.modelTemplate.count(),
    ]);

    // Generate confirmation code
    const confirmationCode = `RESET-${Date.now()}`;
    const userId = req.user?.userId || 'unknown';
    confirmationCodes.set(userId, {
      code: confirmationCode,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    });

    res.json({
      toDelete: {
        groups,
        students,
        submissions,
        messages,
        literature,
        filesOnDisk,
      },
      toPreserve: {
        admins,
        instructors,
        modelTemplates,
      },
      confirmationCode,
    });
  } catch (error) {
    console.error('Error generating reset preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Create and download archive of all data
router.get('/nuclear-reset/archive', async (req: AuthRequest, res: Response) => {
  try {
    // Fetch all groups with all related data
    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        submissions: {
          include: {
            submittedBy: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
            modelTemplate: {
              select: { id: true, name: true },
            },
          },
        },
        literature: {
          include: {
            uploadedBy: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        messages: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
            submission: {
              select: { id: true, fileName: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Set up response headers for ZIP download
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="archive-${timestamp}.zip"`);

    // Create archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      throw err;
    });

    // Create manifest
    const manifest = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user?.userId || 'unknown',
      totalGroups: groups.length,
      totalSubmissions: groups.reduce((sum, g) => sum + g.submissions.length, 0),
      totalLiterature: groups.reduce((sum, g) => sum + g.literature.length, 0),
      totalMessages: groups.reduce((sum, g) => sum + g.messages.length, 0),
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        proteinPdbId: g.proteinPdbId,
        proteinName: g.proteinName,
        memberCount: g.members.length,
        submissionCount: g.submissions.length,
        literatureCount: g.literature.length,
        messageCount: g.messages.length,
      })),
    };

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // Process each group
    for (const group of groups) {
      const folderName = sanitizeName(`${group.name}-${group.proteinPdbId}`);

      // Group info
      const groupInfo = {
        id: group.id,
        name: group.name,
        proteinPdbId: group.proteinPdbId,
        proteinName: group.proteinName,
        createdAt: group.createdAt,
        members: group.members.map((m) => ({
          userId: m.user.id,
          email: m.user.email,
          name: `${m.user.firstName} ${m.user.lastName}`,
          joinedAt: m.joinedAt,
        })),
      };
      archive.append(JSON.stringify(groupInfo, null, 2), {
        name: `${folderName}/group-info.json`,
      });

      // Add model files
      for (const submission of group.submissions) {
        const filePath = path.join(MODELS_DIR, submission.filePath);
        if (fs.existsSync(filePath)) {
          const ext = path.extname(submission.filePath);
          const templateName = sanitizeName(submission.modelTemplate?.name || 'Unknown');
          const safeName = sanitizeName(submission.fileName.replace(ext, ''));
          archive.file(filePath, {
            name: `${folderName}/models/${templateName}-${safeName}${ext}`,
          });
        }
      }

      // Add literature files
      for (const lit of group.literature) {
        const filePath = path.join(LITERATURE_DIR, lit.filePath);
        if (fs.existsSync(filePath)) {
          const safeName = sanitizeName(lit.title || lit.fileName);
          archive.file(filePath, {
            name: `${folderName}/literature/${safeName}.pdf`,
          });
        }
      }

      // Add messages
      const messagesData = group.messages.map((m) => ({
        id: m.id,
        userId: m.user.id,
        userEmail: m.user.email,
        userName: `${m.user.firstName} ${m.user.lastName}`,
        content: m.content,
        createdAt: m.createdAt,
        submissionId: m.submissionId,
        submissionFileName: m.submission?.fileName || null,
        isSubmissionComment: !!m.submissionId,
      }));
      archive.append(JSON.stringify(messagesData, null, 2), {
        name: `${folderName}/messages.json`,
      });
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error creating archive:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create archive' });
    }
  }
});

// Execute the nuclear reset
router.post('/nuclear-reset/execute', async (req: AuthRequest, res: Response) => {
  try {
    const { confirmationCode } = req.body as { confirmationCode: string };
    const userId = req.user?.userId || 'unknown';

    // Validate confirmation code
    const storedCode = confirmationCodes.get(userId);
    if (!storedCode || storedCode.code !== confirmationCode) {
      res.status(400).json({ error: 'Invalid confirmation code' });
      return;
    }
    if (storedCode.expiresAt < new Date()) {
      confirmationCodes.delete(userId);
      res.status(400).json({ error: 'Confirmation code has expired' });
      return;
    }

    // Count what we're about to delete (for response)
    const [groupCount, studentCount, submissionCount, messageCount, literatureCount] = await Promise.all([
      prisma.group.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.submission.count(),
      prisma.message.count(),
      prisma.literature.count(),
    ]);

    // Execute reset in transaction
    await prisma.$transaction(async (tx) => {
      // Delete all groups (cascade handles submissions, messages, literature, group members)
      await tx.group.deleteMany({});

      // Delete all student users
      await tx.user.deleteMany({
        where: { role: 'STUDENT' },
      });
    });

    // Clean up files from disk
    let filesRemoved = 0;

    if (fs.existsSync(MODELS_DIR)) {
      const modelFiles = fs.readdirSync(MODELS_DIR);
      for (const file of modelFiles) {
        if (!file.startsWith('.')) {
          try {
            fs.unlinkSync(path.join(MODELS_DIR, file));
            filesRemoved++;
          } catch (err) {
            console.error(`Failed to delete model file ${file}:`, err);
          }
        }
      }
    }

    if (fs.existsSync(LITERATURE_DIR)) {
      const litFiles = fs.readdirSync(LITERATURE_DIR);
      for (const file of litFiles) {
        if (!file.startsWith('.')) {
          try {
            fs.unlinkSync(path.join(LITERATURE_DIR, file));
            filesRemoved++;
          } catch (err) {
            console.error(`Failed to delete literature file ${file}:`, err);
          }
        }
      }
    }

    // Clear the confirmation code
    confirmationCodes.delete(userId);

    console.log(`Nuclear reset executed by user ${userId}. Deleted: ${groupCount} groups, ${studentCount} students, ${submissionCount} submissions, ${messageCount} messages, ${literatureCount} literature, ${filesRemoved} files.`);

    res.json({
      success: true,
      deleted: {
        groups: groupCount,
        students: studentCount,
        submissions: submissionCount,
        messages: messageCount,
        literature: literatureCount,
        filesRemoved,
      },
    });
  } catch (error) {
    console.error('Error executing nuclear reset:', error);
    res.status(500).json({ error: 'Failed to execute reset' });
  }
});

export default router;
