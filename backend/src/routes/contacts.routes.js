import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin, requireOperator } from '../middleware/rbac.js';
import {
  getContacts,
  getContact,
  importContacts,
  deleteContact,
  deleteAllContacts
} from '../controllers/contacts.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Routes are under /api/contacts (base path set in index.js)

// Get all contacts for a campaign (all authenticated users)
router.get('/:campaignId', getContacts);

// Get single contact (all authenticated users)
router.get('/:campaignId/:contactId', getContact);

// Import contacts via CSV (admin/operator only)
router.post('/:campaignId/import', requireOperator, importContacts);

// Delete all contacts from campaign (admin only)
// Note: This must come before the /:contactId route to avoid conflicts
router.delete('/:campaignId/all', requireAdmin, deleteAllContacts);

// Delete single contact (admin/operator only)
router.delete('/:campaignId/:contactId', requireOperator, deleteContact);

export default router;
