import { Router, Response } from 'express';
import multer from 'multer';
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
const PRESENTATIONS_DIR = path.join(UPLOAD_BASE, 'presentations');

// Configure multer for literature uploads (PDF files)
const literatureStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, LITERATURE_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const literatureUpload = multer({
  storage: literatureStorage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for literature'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// ============================================
// GROUPS
// ============================================

// Get all groups (instructors can see all groups)
router.get('/groups', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const groups = await prisma.group.findMany({
      orderBy: { name: 'asc' }
    });

    // Get user's read statuses for group discussions (submissionId is null for group chat)
    const readStatuses = await prisma.messageReadStatus.findMany({
      where: {
        userId,
        submissionId: null
      }
    });

    const activeTemplateCount = await prisma.modelTemplate.count({ where: { isActive: true } });

    // Get submission counts for each group
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        // Count distinct templates this group has formally submitted (excludes DRAFT)
        const submittedTemplates = await prisma.submission.findMany({
          where: { groupId: group.id, status: { not: 'DRAFT' } },
          select: { modelTemplateId: true },
          distinct: ['modelTemplateId'],
        });
        const submissionCount = submittedTemplates.length;

        // Count distinct templates currently awaiting instructor review
        const pendingTemplates = await prisma.submission.findMany({
          where: { groupId: group.id, status: 'SUBMITTED' },
          select: { modelTemplateId: true },
          distinct: ['modelTemplateId'],
        });
        const pendingCount = pendingTemplates.length;

        const memberCount = await prisma.groupMember.count({
          where: { groupId: group.id }
        });

        // Get unread message count for group discussion
        const readStatus = readStatuses.find(rs => rs.groupId === group.id);
        const unreadMessageCount = await prisma.message.count({
          where: {
            groupId: group.id,
            submissionId: null, // Only group chat messages, not submission comments
            ...(readStatus ? { createdAt: { gt: readStatus.lastReadAt } } : {})
          }
        });

        return {
          ...group,
          submissionCount,
          pendingCount,
          memberCount,
          unreadMessageCount,
          activeTemplateCount,
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
    const userId = req.user!.userId;

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

    // Get user's read status for all submissions in this group
    const readStatuses = await prisma.messageReadStatus.findMany({
      where: {
        userId,
        groupId,
        submissionId: { not: null }
      }
    });

    // Map templates with their submissions and unread counts
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

    res.json(modelsWithSubmissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Get submission file (accepts optional .png extension for JSmol compatibility)
router.get('/submissions/file/:submissionId', async (req: AuthRequest, res: Response) => {
  try {
    // Strip .png extension if present (added for JSmol file type detection)
    const submissionId = (req.params.submissionId as string).replace(/\.png$/, '');

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

// Upload literature to a group
router.post('/groups/:groupId/literature', literatureUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
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

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      fs.unlinkSync(file.path);
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    const literature = await prisma.literature.create({
      data: {
        groupId,
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

// Delete literature
router.delete('/literature/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const literature = await prisma.literature.findUnique({ where: { id } });
    if (!literature) {
      res.status(404).json({ error: 'Literature not found' });
      return;
    }

    const filePath = path.join(LITERATURE_DIR, literature.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.literature.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting literature:', error);
    res.status(500).json({ error: 'Failed to delete literature' });
  }
});

// ============================================
// PRESENTATIONS
// ============================================

// Get all presentations across all groups
router.get('/presentations/all', async (req: AuthRequest, res: Response) => {
  try {
    const presentations = await prisma.presentation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true }
        },
        group: {
          select: { id: true, name: true, proteinPdbId: true, schoolName: true }
        }
      }
    });

    res.json(presentations);
  } catch (error) {
    console.error('Error fetching presentations:', error);
    res.status(500).json({ error: 'Failed to fetch presentations' });
  }
});

// Get presentation file
router.get('/presentations/file/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const presentation = await prisma.presentation.findUnique({
      where: { id }
    });

    if (!presentation) {
      res.status(404).json({ error: 'Presentation not found' });
      return;
    }

    const filePath = path.join(PRESENTATIONS_DIR, presentation.filePath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const filename = typeof req.query.filename === 'string' && req.query.filename
      ? req.query.filename
      : presentation.fileName;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error fetching presentation file:', error);
    res.status(500).json({ error: 'Failed to fetch presentation file' });
  }
});

// GET /groups/:groupId/activity — time-series + summary effort data for all group members
router.get('/groups/:groupId/activity', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } }
    });

    // Dynamic window: group creation → today
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { createdAt: true } });
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const windowStart = group?.createdAt && group.createdAt > thirtyDaysAgo
      ? group.createdAt
      : thirtyDaysAgo;

    // Normalise windowStart to midnight so the first day bucket is complete
    windowStart.setHours(0, 0, 0, 0);

    const msPerDay = 24 * 60 * 60 * 1000;
    const DAYS = Math.ceil((now.getTime() - windowStart.getTime()) / msPerDay) + 1;

    // Generate array of ISO date strings "YYYY-MM-DD" for the window, oldest first
    const days: string[] = [];
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(windowStart.getTime() + i * msPerDay);
      days.push(d.toISOString().slice(0, 10));
    }

    // Helper: bucket an array of timestamps into daily counts
    function bucketByDay(dates: Date[]): Record<string, number> {
      const counts: Record<string, number> = {};
      for (const d of dates) {
        const key = d.toISOString().slice(0, 10);
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    }

    // Helper: bucket viewer sessions into daily minutes
    function bucketViewerMinutes(sessions: { startedAt: Date; endedAt: Date | null }[]): Record<string, number> {
      const minutes: Record<string, number> = {};
      for (const s of sessions) {
        if (!s.endedAt) continue;
        const key = s.startedAt.toISOString().slice(0, 10);
        const mins = Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60000);
        minutes[key] = (minutes[key] ?? 0) + mins;
      }
      return minutes;
    }

    const memberStats = await Promise.all(members.map(async (m) => {
      const userId = m.userId;
      const user = (m as typeof m & { user: { firstName: string; lastName: string } }).user;

      const [loginEvents, viewerSessions, messages, literatureCount, submissionCount] =
        await Promise.all([
          prisma.loginEvent.findMany({
            where: { userId, createdAt: { gte: windowStart } },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' }
          }),
          prisma.viewerSession.findMany({
            where: { groupId, userId, startedAt: { gte: windowStart } },
            select: { startedAt: true, endedAt: true },
            orderBy: { startedAt: 'asc' }
          }),
          prisma.message.findMany({
            where: { userId, groupId, createdAt: { gte: windowStart } },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' }
          }),
          prisma.literature.count({ where: { uploadedById: userId, groupId } }),
          prisma.submission.count({ where: { submittedById: userId, groupId, status: { not: 'DRAFT' } } })
        ]);

      const loginBuckets = bucketByDay(loginEvents.map(e => e.createdAt));
      const viewerBuckets = bucketViewerMinutes(viewerSessions);
      const messageBuckets = bucketByDay(messages.map(e => e.createdAt));

      return {
        userId,
        firstName: user.firstName,
        lastName: user.lastName,
        literatureCount,
        submissionCount,
        // Parallel arrays aligned to `days`
        logins: days.map(d => loginBuckets[d] ?? 0),
        viewerMinutes: days.map(d => viewerBuckets[d] ?? 0),
        messages: days.map(d => messageBuckets[d] ?? 0),
      };
    }));

    res.json({ days, members: memberStats });
  } catch (error) {
    console.error('Error fetching group activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity data' });
  }
});

// ============================================
// MESSAGE INBOX (all threads across all groups)
// ============================================

router.get('/messages/threads', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [groups, readStatuses, allSubmissions] = await Promise.all([
      prisma.group.findMany({
        select: { id: true, name: true, proteinPdbId: true, proteinName: true },
        orderBy: { name: 'asc' },
      }),
      prisma.messageReadStatus.findMany({ where: { userId } }),
      prisma.submission.findMany({
        select: {
          id: true,
          groupId: true,
          modelTemplate: { select: { name: true } },
        },
      }),
    ]);

    const submissionsByGroup = new Map<string, typeof allSubmissions>();
    for (const sub of allSubmissions) {
      if (!submissionsByGroup.has(sub.groupId)) submissionsByGroup.set(sub.groupId, []);
      submissionsByGroup.get(sub.groupId)!.push(sub);
    }

    const threads: {
      groupId: string; groupName: string; proteinPdbId: string;
      submissionId: string | null; label: string;
      latestMessage: { content: string; createdAt: Date; user: { firstName: string; lastName: string } };
      unreadCount: number;
    }[] = [];

    await Promise.all(groups.map(async (group) => {
      const groupThreads = threads; // push directly, array is shared

      // General thread
      const generalReadStatus = readStatuses.find(
        rs => rs.groupId === group.id && rs.submissionId === null
      );
      const [latestGeneral, generalUnread] = await Promise.all([
        prisma.message.findFirst({
          where: { groupId: group.id, submissionId: null },
          orderBy: { createdAt: 'desc' },
          select: { content: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
        }),
        prisma.message.count({
          where: {
            groupId: group.id,
            submissionId: null,
            ...(generalReadStatus ? { createdAt: { gt: generalReadStatus.lastReadAt } } : {}),
          },
        }),
      ]);

      if (latestGeneral) {
        groupThreads.push({
          groupId: group.id, groupName: group.name, proteinPdbId: group.proteinPdbId,
          submissionId: null, label: 'General',
          latestMessage: latestGeneral,
          unreadCount: generalUnread,
        });
      }

      // Submission threads
      const groupSubs = submissionsByGroup.get(group.id) ?? [];
      await Promise.all(groupSubs.map(async (sub) => {
        const subReadStatus = readStatuses.find(rs => rs.submissionId === sub.id);
        const [latestSub, subUnread] = await Promise.all([
          prisma.message.findFirst({
            where: { submissionId: sub.id },
            orderBy: { createdAt: 'desc' },
            select: { content: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
          }),
          prisma.message.count({
            where: {
              submissionId: sub.id,
              ...(subReadStatus ? { createdAt: { gt: subReadStatus.lastReadAt } } : {}),
            },
          }),
        ]);

        if (latestSub) {
          groupThreads.push({
            groupId: group.id, groupName: group.name, proteinPdbId: group.proteinPdbId,
            submissionId: sub.id, label: sub.modelTemplate.name,
            latestMessage: latestSub,
            unreadCount: subUnread,
          });
        }
      }));
    }));

    threads.sort((a, b) =>
      new Date(b.latestMessage.createdAt).getTime() - new Date(a.latestMessage.createdAt).getTime()
    );

    res.json(threads);
  } catch (error) {
    console.error('Error fetching message threads:', error);
    res.status(500).json({ error: 'Failed to fetch message threads' });
  }
});

export default router;
