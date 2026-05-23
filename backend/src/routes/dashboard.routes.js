import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getOverview,
  getSessionsOverview,
  getCampaignsOverview
} from '../controllers/dashboard.controller.js';
import {
  campaignSSEHandler,
  dashboardSSEHandler
} from '../websocket/sse.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Real-time SSE endpoints
router.get('/stream', dashboardSSEHandler);

// Overview statistics
router.get('/overview', getOverview);
router.get('/sessions-overview', getSessionsOverview);
router.get('/campaigns-overview', getCampaignsOverview);

export default router;
