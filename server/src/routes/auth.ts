import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  sendPasswordResetEmail,
  sendApplicationConfirmationEmail,
  sendAdminNewApplicationEmail,
} from '../services/emailService.js';

const APPLICATIONS_DIR = path.join(process.cwd(), 'uploads', 'applications');
if (!fs.existsSync(APPLICATIONS_DIR)) {
  fs.mkdirSync(APPLICATIONS_DIR, { recursive: true });
}

const applicationUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, APPLICATIONS_DIR),
    filename: (_req, _file, cb) => {
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.pdf`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '6h') as SignOptions['expiresIn'];
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

    // Fire-and-forget — don't block the login response
    prisma.loginEvent.create({ data: { userId: user.id } }).catch(() => {});

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

// Submit application
router.post('/apply', applicationUpload.single('pdfFile'), async (req: Request, res: Response) => {
  try {
    const {
      wsspSchoolNumber,
      schoolName,
      studentAFirstName,
      studentALastName,
      studentAEmail,
      studentBFirstName,
      studentBLastName,
      studentBEmail,
      teacherName,
      teacherEmail,
      cloneNumber,
      proteinName,
      pdbAccessionNumber,
      sequenceIdentity,
      researchArticleCitation,
    } = req.body;

    const requiredFields = {
      wsspSchoolNumber,
      schoolName,
      studentAFirstName,
      studentALastName,
      studentAEmail,
      studentBFirstName,
      studentBLastName,
      studentBEmail,
      teacherName,
      teacherEmail,
      cloneNumber,
      proteinName,
      pdbAccessionNumber,
      sequenceIdentity,
      researchArticleCitation,
    };

    const missing = Object.entries(requiredFields)
      .filter(([, v]) => !v || (v as string).trim() === '')
      .map(([k]) => k);

    if (missing.length > 0) {
      if (req.file) fs.unlinkSync(path.join(APPLICATIONS_DIR, req.file.filename));
      res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'A PDF description of the protein function is required' });
      return;
    }

    const emailA = (studentAEmail as string).trim().toLowerCase();
    const emailB = (studentBEmail as string).trim().toLowerCase();

    if (emailA === emailB) {
      if (req.file) fs.unlinkSync(path.join(APPLICATIONS_DIR, req.file.filename));
      res.status(400).json({ error: 'Student A and Student B must have different email addresses' });
      return;
    }

    if (!/^[A-Za-z0-9]{4}$/.test((pdbAccessionNumber as string).trim())) {
      if (req.file) fs.unlinkSync(path.join(APPLICATIONS_DIR, req.file.filename));
      res.status(400).json({ error: 'PDB Accession Number must be exactly 4 alphanumeric characters' });
      return;
    }

    // Check for existing accounts with these emails
    const existingUser = await prisma.user.findFirst({
      where: { email: { in: [emailA, emailB] } },
    });
    if (existingUser) {
      fs.unlinkSync(path.join(APPLICATIONS_DIR, req.file.filename));
      res.status(409).json({ error: 'An account already exists for one of the student emails provided' });
      return;
    }

    // Check for existing pending/approved applications with these emails
    const existingApp = await prisma.application.findFirst({
      where: {
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          { studentAEmail: { in: [emailA, emailB] } },
          { studentBEmail: { in: [emailA, emailB] } },
        ],
      },
    });
    if (existingApp) {
      fs.unlinkSync(path.join(APPLICATIONS_DIR, req.file.filename));
      res.status(409).json({ error: 'An application with one of these email addresses is already on file' });
      return;
    }

    const application = await prisma.application.create({
      data: {
        wsspSchoolNumber: (wsspSchoolNumber as string).trim(),
        schoolName: (schoolName as string).trim(),
        studentAFirstName: (studentAFirstName as string).trim(),
        studentALastName: (studentALastName as string).trim(),
        studentAEmail: emailA,
        studentBFirstName: (studentBFirstName as string).trim(),
        studentBLastName: (studentBLastName as string).trim(),
        studentBEmail: emailB,
        teacherName: (teacherName as string).trim(),
        teacherEmail: (teacherEmail as string).trim().toLowerCase(),
        cloneNumber: (cloneNumber as string).trim(),
        proteinName: (proteinName as string).trim(),
        pdbAccessionNumber: (pdbAccessionNumber as string).trim().toUpperCase(),
        sequenceIdentity: (sequenceIdentity as string).trim(),
        researchArticleCitation: (researchArticleCitation as string).trim(),
        pdfFileName: req.file.originalname,
        pdfFilePath: req.file.filename,
      },
    });

    // Send confirmation emails (non-blocking)
    const studentAFullName = `${(studentAFirstName as string).trim()} ${(studentALastName as string).trim()}`;
    const studentBFullName = `${(studentBFirstName as string).trim()} ${(studentBLastName as string).trim()}`;

    sendApplicationConfirmationEmail({
      studentEmail: emailA,
      studentName: (studentAFirstName as string).trim(),
      partnerName: studentBFullName,
      proteinName: (proteinName as string).trim(),
      pdbAccessionNumber: (pdbAccessionNumber as string).trim().toUpperCase(),
      schoolName: (schoolName as string).trim(),
    }).catch((err) => console.error('Failed to send confirmation email to student A:', err));

    sendApplicationConfirmationEmail({
      studentEmail: emailB,
      studentName: (studentBFirstName as string).trim(),
      partnerName: studentAFullName,
      proteinName: (proteinName as string).trim(),
      pdbAccessionNumber: (pdbAccessionNumber as string).trim().toUpperCase(),
      schoolName: (schoolName as string).trim(),
    }).catch((err) => console.error('Failed to send confirmation email to student B:', err));

    sendAdminNewApplicationEmail({
      schoolName: (schoolName as string).trim(),
      wsspSchoolNumber: (wsspSchoolNumber as string).trim(),
      studentAName: studentAFullName,
      studentAEmail: emailA,
      studentBName: studentBFullName,
      studentBEmail: emailB,
      proteinName: (proteinName as string).trim(),
      pdbAccessionNumber: (pdbAccessionNumber as string).trim().toUpperCase(),
      applicationId: application.id,
    }).catch((err) => console.error('Failed to send admin notification email:', err));

    res.status(201).json({ message: 'Application submitted successfully' });
  } catch (error) {
    if (req.file) {
      fs.unlink(path.join(APPLICATIONS_DIR, req.file.filename), () => {});
    }
    console.error('Application submission error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

export default router;
