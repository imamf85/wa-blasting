import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin, requireOperator } from '../middleware/rbac.js';

// Configure multer for CSV upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// Image upload configuration
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and PDF files are allowed'));
    }
  },
});
import {
  getAllCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaignHandler,
  resumeCampaignHandler,
  getCampaignStatsHandler,
  uploadAttachment
} from '../controllers/campaigns.controller.js';
import {
  getContacts,
  importContacts,
  deleteContact
} from '../controllers/contacts.controller.js';
import { campaignSSEHandler } from '../websocket/sse.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all campaigns (all authenticated users)
router.get('/', getAllCampaigns);

// Get single campaign (all authenticated users)
router.get('/:id', getCampaign);

// Create campaign (admin/operator only)
router.post('/', requireOperator, createCampaign);

// Upload attachment
router.post('/attachments/upload',
  authenticate,
  requireOperator,
  imageUpload.single('file'),
  uploadAttachment
);

// Update campaign (admin/operator only)
router.put('/:id', requireOperator, updateCampaign);

// Delete campaign (admin only)
router.delete('/:id', requireAdmin, deleteCampaign);

// Start campaign (admin/operator only)
router.post('/:id/start', requireOperator, startCampaign);

// Pause campaign (admin/operator only)
router.post('/:id/pause', requireOperator, pauseCampaignHandler);

// Resume campaign (admin/operator only)
router.post('/:id/resume', requireOperator, resumeCampaignHandler);

// Get campaign statistics (all authenticated users)
router.get('/:id/stats', getCampaignStatsHandler);

// Real-time SSE stream for campaign events (all authenticated users)
router.get('/:campaignId/stream', campaignSSEHandler);

// ===== Contact Management Routes =====

// Get all contacts for a campaign (all authenticated users)
router.get('/:id/contacts', getContacts);

// Import contacts via CSV (admin/operator only)
router.post('/:id/contacts/import', requireOperator, upload.single('file'), importContacts);

// Delete single contact (admin/operator only)
router.delete('/:id/contacts/:contactId', requireOperator, deleteContact);

export default router;
