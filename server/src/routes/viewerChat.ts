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

// GET /viewer-chat/:groupId/:templateId — fetch all messages
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

    res.json(messages);
  } catch (error) {
    console.error('Error fetching viewer chat:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
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

    res.status(201).json(message);
  } catch (error) {
    console.error('Error posting viewer chat message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

export default router;
