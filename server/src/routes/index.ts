import { Router } from 'express';
import authRoutes from './auth.js';
import adminRoutes from './admin.js';
import studentRoutes from './student.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/student', studentRoutes);

export default router;
