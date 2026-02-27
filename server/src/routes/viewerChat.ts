import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.use(authenticate);

async function hasGroupAccess(userId: string, userRole: string, groupId: string): Promise<boolean> {
  if (userRole === 'INSTRUCTOR' || userRole === 'ADMIN') return true;
  const membership = await prisma.groupMember.findFirst({ where: { userId, groupId } });
  return !!membership;
}

// GET /viewer-chat/:groupId/:templateId — fetch all messages + unread count
router.get('/:groupId/:templateId', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const templateId = req.params.templateId as string;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    if (!(await hasGroupAccess(userId, userRole, groupId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.viewerChat.findMany({
      where: { groupId, modelTemplateId: templateId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } }
      },
      orderBy: { createdAt: 'asc' },
    });

    const readStatus = await prisma.viewerChatReadStatus.findUnique({
      where: { userId_groupId_modelTemplateId: { userId, groupId, modelTemplateId: templateId } }
    });

    const unreadCount = readStatus
      ? messages.filter(m => m.createdAt > readStatus.lastReadAt).length
      : messages.length;

    res.json({ messages, unreadCount });
  } catch (error) {
    console.error('Error fetching viewer chat:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

// PUT /viewer-chat/:groupId/:templateId/read — mark messages as read
router.put('/:groupId/:templateId/read', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const templateId = req.params.templateId as string;
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { lastReadAt } = req.body;

    if (!lastReadAt) {
      return res.status(400).json({ error: 'lastReadAt timestamp is required' });
    }

    if (!(await hasGroupAccess(userId, userRole, groupId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.viewerChatReadStatus.upsert({
      where: { userId_groupId_modelTemplateId: { userId, groupId, modelTemplateId: templateId } },
      update: { lastReadAt: new Date(lastReadAt) },
      create: { userId, groupId, modelTemplateId: templateId, lastReadAt: new Date(lastReadAt) },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Error marking viewer chat as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// POST /viewer-chat/:groupId/:templateId — post a message
router.post('/:groupId/:templateId', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const templateId = req.params.templateId as string;
    const { content } = req.body;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (!(await hasGroupAccess(userId, userRole, groupId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const message = await prisma.viewerChat.create({
      data: { groupId, modelTemplateId: templateId, userId, content: content.trim() },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } }
      },
    });

    // Auto-mark as read for the sender
    await prisma.viewerChatReadStatus.upsert({
      where: { userId_groupId_modelTemplateId: { userId, groupId, modelTemplateId: templateId } },
      update: { lastReadAt: message.createdAt },
      create: { userId, groupId, modelTemplateId: templateId, lastReadAt: message.createdAt },
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Error posting viewer chat message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

export default router;
