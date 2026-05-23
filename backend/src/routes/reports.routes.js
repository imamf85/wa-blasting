import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAllReports,
  getReport,
  getCampaignReports,
  getReportStats
} from '../controllers/reports.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all reports
router.get('/', getAllReports);

// Get report statistics
router.get('/stats', getReportStats);

// Get single report
router.get('/:id', getReport);

// Get reports for a campaign
router.get('/campaign/:campaignId', getCampaignReports);

export default router;
