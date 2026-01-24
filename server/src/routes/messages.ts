import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// All message routes require authentication
router.use(authenticate);

// Helper to check if user has access to a group
// Students can only access their own group, instructors can access all
async function hasGroupAccess(userId: string, userRole: string, groupId: string): Promise<boolean> {
  if (userRole === 'INSTRUCTOR' || userRole === 'ADMIN') {
    return true;
  }

  // For students, check if they're a member of the group
  const membership = await prisma.groupMember.findFirst({
    where: { userId, groupId }
  });
  return !!membership;
}

// Helper to check if user has access to a submission
async function hasSubmissionAccess(userId: string, userRole: string, submissionId: string): Promise<{ hasAccess: boolean; submission: any }> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { group: true }
  });

  if (!submission) {
    return { hasAccess: false, submission: null };
  }

  const hasAccess = await hasGroupAccess(userId, userRole, submission.groupId);
  return { hasAccess, submission };
}

// ============================================
// GROUP CHAT MESSAGES
// ============================================

// Get group chat messages (messages where submissionId is NULL)
router.get('/group/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Check access
    const canAccess = await hasGroupAccess(userId, userRole, groupId);
    if (!canAccess) {
      res.status(403).json({ error: 'You do not have access to this group' });
      return;
    }

    // Get group chat messages (submissionId is null)
    const messages = await prisma.message.findMany({
      where: {
        groupId,
        submissionId: null
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      }
    });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching group messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Post to group chat
router.post('/group/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    // Check access
    const canAccess = await hasGroupAccess(userId, userRole, groupId);
    if (!canAccess) {
      res.status(403).json({ error: 'You do not have access to this group' });
      return;
    }

    // Verify group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        groupId,
        userId,
        content: content.trim(),
        submissionId: null
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      }
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Error posting group message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

// ============================================
// SUBMISSION COMMENTS
// ============================================

// Get submission comments
router.get('/submission/:submissionId', async (req: AuthRequest, res: Response) => {
  try {
    const submissionId = req.params.submissionId as string;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Check access
    const { hasAccess, submission } = await hasSubmissionAccess(userId, userRole, submissionId);
    if (!submission) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }
    if (!hasAccess) {
      res.status(403).json({ error: 'You do not have access to this submission' });
      return;
    }

    // Get comments for this submission
    const comments = await prisma.message.findMany({
      where: {
        submissionId
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      }
    });

    res.json(comments);
  } catch (error) {
    console.error('Error fetching submission comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Post comment on submission
router.post('/submission/:submissionId', async (req: AuthRequest, res: Response) => {
  try {
    const submissionId = req.params.submissionId as string;
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Comment content is required' });
      return;
    }

    // Check access
    const { hasAccess, submission } = await hasSubmissionAccess(userId, userRole, submissionId);
    if (!submission) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }
    if (!hasAccess) {
      res.status(403).json({ error: 'You do not have access to this submission' });
      return;
    }

    // Create comment
    const comment = await prisma.message.create({
      data: {
        groupId: submission.groupId,
        userId,
        submissionId,
        content: content.trim()
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      }
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error posting submission comment:', error);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

export default router;
