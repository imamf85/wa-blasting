import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin, requireOperator } from '../middleware/rbac.js';
import {
  getAllSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  getSessionQR,
  getSessionHealth,
  pauseSession,
  resumeSession,
  runHealthCheck,
  verifyConnection
} from '../controllers/sessions.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all sessions
router.get('/', getAllSessions);

// Get single session
router.get('/:id', getSession);

// Create new session (admin/operator only)
router.post('/', requireOperator, createSession);

// Update session (admin/operator only)
router.put('/:id', requireOperator, updateSession);

// Delete session (admin only)
router.delete('/:id', requireAdmin, deleteSession);

// Get QR code for pairing
router.get('/:id/qr', getSessionQR);

// Get session health
router.get('/:id/health', getSessionHealth);

// Pause session (admin/operator only)
router.post('/:id/pause', requireOperator, pauseSession);

// Resume session (admin/operator only)
router.post('/:id/resume', requireOperator, resumeSession);

// Run manual health check (admin/operator only)
router.post('/:id/health/check', requireOperator, runHealthCheck);

// Verify WAHA connection (admin/operator only)
router.post('/:id/verify', requireOperator, verifyConnection);

export default router;
