import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sessionsAPI } from '../../services/api';

export default function SessionList() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const response = await sessionsAPI.getAll();
      setSessions(response.data.sessions || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete session "${name}"?`)) {
      return;
    }

    try {
      await sessionsAPI.delete(id);
      setSessions(sessions.filter((s) => s.id !== id));
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete session. Please try again.');
    }
  };

  const handlePauseResume = async (session) => {
    try {
      if (session.status === 'paused') {
        await sessionsAPI.resume(session.id);
      } else {
        await sessionsAPI.pause(session.id);
      }
      await loadSessions();
    } catch (error) {
      console.error('Failed to pause/resume session:', error);
      alert('Failed to update session status. Please try again.');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      active: { text: 'Active', bg: 'bg-green-100', color: 'text-green-800' },
      paused: { text: 'Paused', bg: 'bg-yellow-100', color: 'text-yellow-800' },
      disconnected: { text: 'Disconnected', bg: 'bg-red-100', color: 'text-red-800' },
      connecting: { text: 'Connecting', bg: 'bg-blue-100', color: 'text-blue-800' },
    };
    return badges[status] || badges.disconnected;
  };

  const getHealthBadge = (score) => {
    if (score >= 80) return { text: 'Excellent', bg: 'bg-green-100', color: 'text-green-800' };
    if (score >= 60) return { text: 'Good', bg: 'bg-blue-100', color: 'text-blue-800' };
    if (score >= 40) return { text: 'Fair', bg: 'bg-yellow-100', color: 'text-yellow-800' };
    return { text: 'Poor', bg: 'bg-red-100', color: 'text-red-800' };
  };

  const getAccountAgeBadge = (age) => {
    const badges = {
      new: { text: 'New', bg: 'bg-purple-100', color: 'text-purple-800' },
      medium: { text: 'Medium', bg: 'bg-indigo-100', color: 'text-indigo-800' },
      aged: { text: 'Aged', bg: 'bg-blue-100', color: 'text-blue-800' },
    };
    return badges[age] || badges.new;
  };

  const filteredSessions = filter === 'all'
    ? sessions
    : sessions.filter((s) => s.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp Sessions</h1>
          <p className="text-gray-500 mt-1">
            Manage your WhatsApp sender accounts
          </p>
        </div>

        <Link to="/sessions/new" className="btn-primary">
          + New Session
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex space-x-2 border-b border-gray-200">
        {['all', 'active', 'paused', 'disconnected'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 capitalize ${
              filter === status
                ? 'border-b-2 border-primary-600 text-primary-600 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Sessions list */}
      {filteredSessions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSessions.map((session) => {
            const statusBadge = getStatusBadge(session.status);
            const healthBadge = getHealthBadge(session.health_score || 0);
            const ageBadge = getAccountAgeBadge(session.account_age);

            return (
              <div
                key={session.id}
                className="card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {session.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {session.phone_number}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${statusBadge.bg} ${statusBadge.color}`}
                  >
                    {statusBadge.text}
                  </span>
                </div>

                {/* Health & Age badges */}
                <div className="flex gap-2 mb-4">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${healthBadge.bg} ${healthBadge.color}`}
                  >
                    Health: {healthBadge.text} ({session.health_score || 0})
                  </span>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${ageBadge.bg} ${ageBadge.color}`}
                  >
                    {ageBadge.text}
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <p className="text-gray-500">Daily Quota</p>
                    <p className="font-semibold text-gray-900">
                      {session.daily_sent_count || 0} / {session.daily_quota}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Success Rate</p>
                    <p className="font-semibold text-gray-900">
                      {session.success_rate ? `${session.success_rate.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-gray-200">
                  <Link
                    to={`/sessions/${session.id}`}
                    className="flex-1 text-center px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100"
                  >
                    View Details
                  </Link>

                  {session.status !== 'disconnected' && (
                    <button
                      onClick={() => handlePauseResume(session)}
                      className={`px-3 py-2 text-sm font-medium rounded-lg ${
                        session.status === 'paused'
                          ? 'text-green-600 bg-green-50 hover:bg-green-100'
                          : 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100'
                      }`}
                    >
                      {session.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(session.id, session.name)}
                    className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No sessions found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'all'
              ? 'Get started by creating a new WhatsApp session.'
              : `No ${filter} sessions available.`
            }
          </p>
          {filter === 'all' && (
            <div className="mt-6">
              <Link to="/sessions/new" className="btn-primary">
                + Create Session
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
