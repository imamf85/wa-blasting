import supabase from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'campaign-attachments';

/**
 * Upload campaign attachment to Supabase Storage
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {string} fileName - Original filename
 * @param {string} mimeType - File MIME type
 * @returns {Promise<string>} - Public URL
 */
export async function uploadCampaignAttachment(fileBuffer, fileName, mimeType) {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const uuid = uuidv4();
    const ext = fileName.split('.').pop();
    const uniqueFileName = `${timestamp}-${uuid}.${ext}`;
    const filePath = `attachments/${uniqueFileName}`;

    logger.info('Uploading attachment to storage', { fileName, mimeType, size: fileBuffer.length });

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      logger.error('Storage upload failed', { error: error.message });
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    logger.info('Attachment uploaded successfully', { url: urlData.publicUrl });

    return urlData.publicUrl;
  } catch (error) {
    logger.error('Upload error', { error: error.message });
    throw error;
  }
}

/**
 * Delete attachment from storage
 * @param {string} fileUrl - Public URL of file
 * @returns {Promise<void>}
 */
export async function deleteCampaignAttachment(fileUrl) {
  try {
    // Extract file path from URL
    const url = new URL(fileUrl);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)/);

    if (!pathMatch) {
      logger.warn('Could not extract file path from URL', { fileUrl });
      return;
    }

    const filePath = pathMatch[1];

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      logger.error('Storage deletion failed', { error: error.message });
    } else {
      logger.info('Attachment deleted', { filePath });
    }
  } catch (error) {
    logger.error('Delete error', { error: error.message });
  }
}

export default {
  uploadCampaignAttachment,
  deleteCampaignAttachment
};
