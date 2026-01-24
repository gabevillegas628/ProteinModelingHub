import { Router } from 'express';
import authRoutes from './auth.js';
import adminRoutes from './admin.js';
import studentRoutes from './student.js';
import instructorRoutes from './instructor.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/student', studentRoutes);
router.use('/instructor', instructorRoutes);

export default router;
