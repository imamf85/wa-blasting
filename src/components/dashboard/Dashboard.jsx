import { useEffect, useState } from 'react';
import { dashboardAPI } from '../../services/api';
import { useDashboardStream, useRecentEvents } from '../../hooks/useRealtime';
import SessionHealthCard from './SessionHealthCard';

export function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isConnected, sessionEvents } = useDashboardStream();
  const recentEvents = useRecentEvents(5);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [overviewRes, sessionsRes] = await Promise.all([
        dashboardAPI.getOverview(),
        dashboardAPI.getSessionsOverview(),
      ]);

      setOverview(overviewRes.data);
      setSessions(sessionsRes.data.sessions);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Real-time overview of your WhatsApp blast system
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {isConnected ? (
            <span className="flex items-center text-sm text-green-600">
              <span className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
              Live Updates Active
            </span>
          ) : (
            <span className="text-sm text-gray-500">
              Connecting...
            </span>
          )}
        </div>
      </div>

      {/* Overview Stats */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card">
            <div className="text-sm text-gray-500 mb-1">Total Campaigns</div>
            <div className="text-3xl font-bold text-gray-900">
              {overview.campaigns.total}
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {overview.campaigns.active} active
            </div>
          </div>

          <div className="card">
            <div className="text-sm text-gray-500 mb-1">Connected Sessions</div>
            <div className="text-3xl font-bold text-green-600">
              {overview.sessions.connected}
            </div>
            <div className="text-sm text-gray-500 mt-2">
              of {overview.sessions.total} total
            </div>
          </div>

          <div className="card">
            <div className="text-sm text-gray-500 mb-1">Messages Today</div>
            <div className="text-3xl font-bold text-blue-600">
              {overview.messages.sentToday.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {overview.messages.failedToday} failed
            </div>
          </div>

          <div className="card">
            <div className="text-sm text-gray-500 mb-1">Success Rate</div>
            <div className={`text-3xl font-bold ${
              overview.messages.successRate >= 95 ? 'text-green-600' :
              overview.messages.successRate >= 85 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {overview.messages.successRate}%
            </div>
            <div className="text-sm text-gray-500 mt-2">
              Avg health: {overview.sessions.averageHealth}
            </div>
          </div>
        </div>
      )}

      {/* Recent Events */}
      {(recentEvents.length > 0 || sessionEvents.length > 0) && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Events
          </h2>

          <div className="space-y-3">
            {sessionEvents.slice(0, 3).map((event, index) => (
              <div
                key={`session-${index}`}
                className={`p-3 rounded-lg ${
                  event.type === 'session_paused' ? 'bg-yellow-50' :
                  event.type === 'session_resumed' ? 'bg-green-50' :
                  'bg-blue-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {event.type === 'session_paused' && '⏸️ Session Paused'}
                      {event.type === 'session_resumed' && '▶️ Session Resumed'}
                      {event.type === 'session_connected' && '✅ Session Connected'}
                      {event.type === 'session_disconnected' && '❌ Session Disconnected'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {event.sessionName} ({event.phoneNumber})
                    </p>
                    {event.reason && (
                      <p className="text-xs text-gray-500 mt-1">
                        {event.reason}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}

            {sessionEvents.length === 0 && recentEvents.length > 0 && (
              recentEvents.slice(0, 3).map((event, index) => (
                <div
                  key={`event-${index}`}
                  className="p-3 rounded-lg bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {event.type === 'message_sent' && '✅ Message Sent'}
                        {event.type === 'message_failed' && '❌ Message Failed'}
                        {event.type === 'campaign_completed' && '🎉 Campaign Completed'}
                      </p>
                      {event.contactName && (
                        <p className="text-xs text-gray-600 mt-1">
                          {event.contactName}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {sessionEvents.length === 0 && recentEvents.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No recent events
            </p>
          )}
        </div>
      )}

      {/* Session Health Cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Session Health
        </h2>

        {sessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session) => (
              <SessionHealthCard key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <div className="card text-center py-12">
            <p className="text-gray-500">No sessions found</p>
            <p className="text-sm text-gray-400 mt-2">
              Add WhatsApp sessions to start sending messages
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
