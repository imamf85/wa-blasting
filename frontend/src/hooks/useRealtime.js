import { useEffect, useRef, useState } from 'react';
import { getStreamURL } from '../services/api';
import useRealtimeStore from '../store/realtimeStore';

/**
 * Hook for connecting to campaign real-time stream
 */
export function useCampaignStream(campaignId) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  const {
    updateCampaignStats,
    incrementSent,
    incrementFailed,
    addEvent,
  } = useRealtimeStore();

  useEffect(() => {
    if (!campaignId) return;

    const url = getStreamURL.campaign(campaignId);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Connected
    eventSource.addEventListener('connected', (e) => {
      console.log('Campaign stream connected:', e.data);
      setIsConnected(true);
      setError(null);
    });

    // Message sent
    eventSource.addEventListener('message_sent', (e) => {
      const data = JSON.parse(e.data);
      incrementSent(campaignId);
      addEvent({
        type: 'message_sent',
        campaignId,
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      });
    });

    // Message failed
    eventSource.addEventListener('message_failed', (e) => {
      const data = JSON.parse(e.data);
      incrementFailed(campaignId);
      addEvent({
        type: 'message_failed',
        campaignId,
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      });
    });

    // Campaign completed
    eventSource.addEventListener('campaign_completed', (e) => {
      const data = JSON.parse(e.data);
      updateCampaignStats(campaignId, data.stats);
      addEvent({
        type: 'campaign_completed',
        campaignId,
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      });
    });

    // Error handling
    eventSource.onerror = (error) => {
      console.error('Campaign stream error:', error);
      setIsConnected(false);

      if (eventSource.readyState === EventSource.CLOSED) {
        setError('Connection closed');
      } else {
        setError('Connection error');
      }
    };

    // Cleanup
    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [campaignId, incrementSent, incrementFailed, updateCampaignStats, addEvent]);

  return {
    isConnected,
    error,
    disconnect: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        setIsConnected(false);
      }
    },
  };
}

/**
 * Hook for connecting to dashboard global stream
 */
export function useDashboardStream() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [sessionEvents, setSessionEvents] = useState([]);
  const eventSourceRef = useRef(null);

  const { addEvent } = useRealtimeStore();

  useEffect(() => {
    const url = getStreamURL.dashboard();
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Connected
    eventSource.addEventListener('connected', (e) => {
      console.log('Dashboard stream connected:', e.data);
      setIsConnected(true);
      setError(null);
    });

    // Session paused
    eventSource.addEventListener('session_paused', (e) => {
      const data = JSON.parse(e.data);
      const event = {
        type: 'session_paused',
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      };
      setSessionEvents((prev) => [event, ...prev].slice(0, 20));
      addEvent(event);
    });

    // Session resumed
    eventSource.addEventListener('session_resumed', (e) => {
      const data = JSON.parse(e.data);
      const event = {
        type: 'session_resumed',
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      };
      setSessionEvents((prev) => [event, ...prev].slice(0, 20));
      addEvent(event);
    });

    // Session connected
    eventSource.addEventListener('session_connected', (e) => {
      const data = JSON.parse(e.data);
      const event = {
        type: 'session_connected',
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      };
      setSessionEvents((prev) => [event, ...prev].slice(0, 20));
      addEvent(event);
    });

    // Session disconnected
    eventSource.addEventListener('session_disconnected', (e) => {
      const data = JSON.parse(e.data);
      const event = {
        type: 'session_disconnected',
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      };
      setSessionEvents((prev) => [event, ...prev].slice(0, 20));
      addEvent(event);
    });

    // Health alert
    eventSource.addEventListener('health_alert', (e) => {
      const data = JSON.parse(e.data);
      addEvent({
        type: 'health_alert',
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      });
    });

    // Quota warning
    eventSource.addEventListener('quota_warning', (e) => {
      const data = JSON.parse(e.data);
      addEvent({
        type: 'quota_warning',
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
      });
    });

    // Error handling
    eventSource.onerror = (error) => {
      console.error('Dashboard stream error:', error);
      setIsConnected(false);

      if (eventSource.readyState === EventSource.CLOSED) {
        setError('Connection closed');
      } else {
        setError('Connection error');
      }
    };

    // Cleanup
    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [addEvent]);

  return {
    isConnected,
    error,
    sessionEvents,
    disconnect: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        setIsConnected(false);
      }
    },
  };
}

/**
 * Hook to get campaign stats from store
 */
export function useCampaignStats(campaignId) {
  const campaignStats = useRealtimeStore((state) => state.campaignStats[campaignId]);

  return campaignStats || { sent: 0, failed: 0, queued: 0 };
}

/**
 * Hook to get recent events
 */
export function useRecentEvents(limit = 10) {
  const recentEvents = useRealtimeStore((state) => state.recentEvents.slice(0, limit));

  return recentEvents;
}
