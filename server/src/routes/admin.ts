import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

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

export default router;
