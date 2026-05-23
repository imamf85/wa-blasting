import axios from 'axios';
import logger from '../utils/logger.js';

/**
 * WAHA API Service
 * Wrapper for WhatsApp HTTP API interactions
 */
export class WAHAService {
  constructor(sessionConfig) {
    this.baseURL = sessionConfig.waha_api_url || process.env.WAHA_API_BASE_URL;
    this.apiKey = sessionConfig.waha_api_key || process.env.WAHA_API_KEY;
    this.sessionName = sessionConfig.session_name;

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'X-Api-Key': this.apiKey })
      }
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('WAHA Request', {
          method: config.method,
          url: config.url,
          session: this.sessionName
        });
        return config;
      },
      (error) => {
        logger.error('WAHA Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('WAHA Response', {
          status: response.status,
          session: this.sessionName
        });
        return response;
      },
      (error) => {
        logger.error('WAHA Response Error', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
          session: this.sessionName
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Send text message
   */
  async sendMessage({ chatId, text }) {
    try {
      const response = await this.client.post(`/api/sendText`, {
        session: this.sessionName,
        chatId,
        text
      });

      logger.info('Message sent successfully', {
        session: this.sessionName,
        chatId,
        messageId: response.data.id
      });

      return {
        success: true,
        id: response.data.id,
        timestamp: response.data.timestamp,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to send message', {
        session: this.sessionName,
        chatId,
        error: error.message,
        response: error.response?.data
      });

      throw new Error(`WAHA send failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Send image with optional caption
   */
  async sendImage({ chatId, mediaUrl, caption }) {
    try {
      const response = await this.client.post(`/api/sendImage`, {
        session: this.sessionName,
        chatId,
        file: {
          url: mediaUrl
        },
        caption: caption || ''
      });

      logger.info('Image sent successfully', {
        session: this.sessionName,
        chatId,
        messageId: response.data.id
      });

      return {
        success: true,
        id: response.data.id,
        timestamp: response.data.timestamp,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to send image', {
        session: this.sessionName,
        chatId,
        error: error.message
      });

      throw new Error(`WAHA send image failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get session status
   */
  async getSession() {
    try {
      const response = await this.client.get(`/api/sessions/${this.sessionName}`);

      return {
        status: response.data.status, // CONNECTED, DISCONNECTED, etc.
        me: response.data.me,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to get session', {
        session: this.sessionName,
        error: error.message
      });

      throw new Error(`WAHA get session failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get QR code for session pairing
   */
  async getQRCode() {
    try {
      const response = await this.client.get(`/api/${this.sessionName}/auth/qr`);

      return {
        qr: response.data.qr, // Base64 image or QR string
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to get QR code', {
        session: this.sessionName,
        error: error.message
      });

      throw new Error(`WAHA get QR failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Start session
   */
  async startSession() {
    try {
      const response = await this.client.post(`/api/sessions/start`, {
        name: this.sessionName
      });

      logger.info('Session started', {
        session: this.sessionName
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to start session', {
        session: this.sessionName,
        error: error.message
      });

      throw new Error(`WAHA start session failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Stop session
   */
  async stopSession() {
    try {
      const response = await this.client.post(`/api/sessions/stop`, {
        name: this.sessionName
      });

      logger.info('Session stopped', {
        session: this.sessionName
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to stop session', {
        session: this.sessionName,
        error: error.message
      });

      throw new Error(`WAHA stop session failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Check if chat exists
   */
  async checkChatExists(chatId) {
    try {
      const response = await this.client.post(`/api/checkNumberStatus`, {
        session: this.sessionName,
        phone: chatId
      });

      return {
        exists: response.data.exists,
        data: response.data
      };
    } catch (error) {
      logger.warn('Failed to check chat exists', {
        session: this.sessionName,
        chatId,
        error: error.message
      });

      // Return false if check fails (don't throw)
      return {
        exists: false,
        error: error.message
      };
    }
  }
}

export default WAHAService;
