import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Create axios instance
const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  logout: () =>
    api.post('/auth/logout'),

  me: () =>
    api.get('/auth/me'),

  refresh: () =>
    api.post('/auth/refresh'),
};

// Sessions API
export const sessionsAPI = {
  getAll: () =>
    api.get('/sessions'),

  getOne: (id) =>
    api.get(`/sessions/${id}`),

  create: (data) =>
    api.post('/sessions', data),

  update: (id, data) =>
    api.put(`/sessions/${id}`, data),

  delete: (id) =>
    api.delete(`/sessions/${id}`),

  getQR: (id) =>
    api.get(`/sessions/${id}/qr`),

  getHealth: (id) =>
    api.get(`/sessions/${id}/health`),

  pause: (id) =>
    api.post(`/sessions/${id}/pause`),

  resume: (id) =>
    api.post(`/sessions/${id}/resume`),

  healthCheck: (id) =>
    api.post(`/sessions/${id}/health/check`),

  verify: (id) =>
    api.post(`/sessions/${id}/verify`),
};

// Campaigns API
export const campaignsAPI = {
  getAll: (params) =>
    api.get('/campaigns', { params }),

  getOne: (id) =>
    api.get(`/campaigns/${id}`),

  create: (data) =>
    api.post('/campaigns', data),

  update: (id, data) =>
    api.put(`/campaigns/${id}`, data),

  delete: (id) =>
    api.delete(`/campaigns/${id}`),

  start: (id) =>
    api.post(`/campaigns/${id}/start`),

  pause: (id) =>
    api.post(`/campaigns/${id}/pause`),

  resume: (id) =>
    api.post(`/campaigns/${id}/resume`),

  getStats: (id) =>
    api.get(`/campaigns/${id}/stats`),
};

// Contacts API
export const contactsAPI = {
  getAll: (campaignId, params) =>
    api.get(`/campaigns/${campaignId}/contacts`, { params }),

  import: (campaignId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/campaigns/${campaignId}/contacts/import`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  delete: (campaignId, contactId) =>
    api.delete(`/campaigns/${campaignId}/contacts/${contactId}`),
};

// Dashboard API
export const dashboardAPI = {
  getOverview: () =>
    api.get('/dashboard/overview'),

  getSessionsOverview: () =>
    api.get('/dashboard/sessions-overview'),

  getCampaignsOverview: (params) =>
    api.get('/dashboard/campaigns-overview', { params }),
};

// SSE Stream URLs (use directly with EventSource)
export const getStreamURL = {
  campaign: (campaignId) => {
    const token = localStorage.getItem('access_token');
    return `${API_URL}/api/campaigns/${campaignId}/stream?token=${token}`;
  },

  dashboard: () => {
    const token = localStorage.getItem('access_token');
    return `${API_URL}/api/dashboard/stream?token=${token}`;
  },
};

export default api;
