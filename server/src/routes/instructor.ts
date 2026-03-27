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
const PRESENTATIONS_DIR = path.join(UPLOAD_BASE, 'presentations');

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
          select: { id: true, name: true }
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

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${presentation.fileName}"`);
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

export default router;
