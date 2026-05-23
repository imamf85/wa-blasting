import { create } from 'zustand';

const useRealtimeStore = create((set, get) => ({
  // Campaign-specific stats
  campaignStats: {},

  // System-wide events
  recentEvents: [],
  maxRecentEvents: 50,

  // Update campaign stats
  updateCampaignStats: (campaignId, update) => {
    set((state) => ({
      campaignStats: {
        ...state.campaignStats,
        [campaignId]: {
          ...(state.campaignStats[campaignId] || { sent: 0, failed: 0, queued: 0 }),
          ...update,
        },
      },
    }));
  },

  // Increment sent count
  incrementSent: (campaignId) => {
    const current = get().campaignStats[campaignId] || { sent: 0, failed: 0, queued: 0 };
    set((state) => ({
      campaignStats: {
        ...state.campaignStats,
        [campaignId]: {
          ...current,
          sent: current.sent + 1,
          queued: Math.max(0, current.queued - 1),
        },
      },
    }));
  },

  // Increment failed count
  incrementFailed: (campaignId) => {
    const current = get().campaignStats[campaignId] || { sent: 0, failed: 0, queued: 0 };
    set((state) => ({
      campaignStats: {
        ...state.campaignStats,
        [campaignId]: {
          ...current,
          failed: current.failed + 1,
          queued: Math.max(0, current.queued - 1),
        },
      },
    }));
  },

  // Add event to recent events
  addEvent: (event) => {
    set((state) => {
      const newEvents = [event, ...state.recentEvents];
      return {
        recentEvents: newEvents.slice(0, state.maxRecentEvents),
      };
    });
  },

  // Clear campaign stats
  clearCampaignStats: (campaignId) => {
    set((state) => {
      const newStats = { ...state.campaignStats };
      delete newStats[campaignId];
      return { campaignStats: newStats };
    });
  },

  // Clear all stats
  clearAll: () => {
    set({
      campaignStats: {},
      recentEvents: [],
    });
  },
}));

export default useRealtimeStore;
