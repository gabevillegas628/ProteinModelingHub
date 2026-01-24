import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
const PASSWORD_RESET_EXPIRES_HOURS = 1; // Reset token expires in 1 hour

interface RegisterBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: Role;
  groupId?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

// Get available groups (public - for registration dropdown)
router.get('/groups', async (req: Request, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      select: {
        id: true,
        name: true,
        proteinPdbId: true,
        proteinName: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Register
router.post('/register', async (req: Request<{}, {}, RegisterBody>, res: Response) => {
  try {
    const { email, password, firstName, lastName, role = 'STUDENT', groupId } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Validate groupId if provided and role is STUDENT
    if (role === 'STUDENT' && groupId) {
      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) {
        res.status(400).json({ error: 'Invalid group selected' });
        return;
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user (not approved by default, except ADMIN role for initial setup)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role,
        isApproved: role === 'ADMIN', // Auto-approve admins for initial setup
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isApproved: true,
        createdAt: true
      }
    });

    // If student selected a group, add them as a member
    if (role === 'STUDENT' && groupId) {
      await prisma.groupMember.create({
        data: {
          userId: user.id,
          groupId: groupId,
        },
      });
    }

    // Only provide token if user is approved
    if (user.isApproved) {
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      res.status(201).json({ user, token });
    } else {
      res.status(201).json({
        user,
        message: 'Registration successful. Please wait for admin approval.'
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request<{}, {}, LoginBody>, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if approved
    if (!user.isApproved) {
      res.status(403).json({ error: 'Account pending approval. Please contact an administrator.' });
      return;
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isApproved: user.isApproved
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isApproved: true,
        createdAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Forgot Password - Request reset link
router.post('/forgot-password', async (req: Request<{}, {}, { email: string }>, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      res.json({ message: 'If an account exists with this email, you will receive reset instructions.' });
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRES_HOURS * 60 * 60 * 1000);

    // Save token to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      },
    });

    // Send reset email
    const emailSent = await sendPasswordResetEmail(
      user.email,
      user.firstName,
      resetToken
    );

    if (!emailSent) {
      console.error('Failed to send password reset email to:', user.email);
      // Still return success to prevent enumeration
    }

    res.json({ message: 'If an account exists with this email, you will receive reset instructions.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset Password - Complete the reset
router.post('/reset-password', async (req: Request<{}, {}, { token: string; password: string }>, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ error: 'Token and password are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
