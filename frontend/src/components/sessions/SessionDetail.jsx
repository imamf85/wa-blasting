import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { sessionsAPI } from '../../services/api';

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [health, setHealth] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadSession();
    loadHealth();
  }, [id]);

  const loadSession = async () => {
    try {
      const response = await sessionsAPI.getOne(id);
      setSession(response.data.session);
    } catch (error) {
      console.error('Failed to load session:', error);
      alert('Failed to load session details.');
    } finally {
      setLoading(false);
    }
  };

  const loadHealth = async () => {
    try {
      const response = await sessionsAPI.getHealth(id);
      setHealth(response.data.health);
    } catch (error) {
      console.error('Failed to load health:', error);
    }
  };

  const loadQRCode = async () => {
    try {
      const response = await sessionsAPI.getQR(id);
      if (response.data.qr) {
        setQrCode(response.data.qr);
      } else {
        alert('No QR code available. Session might already be connected.');
      }
    } catch (error) {
      console.error('Failed to load QR code:', error);
      alert('Failed to load QR code. Please try again.');
    }
  };

  const handlePauseResume = async () => {
    try {
      setActionLoading(true);
      if (session.status === 'paused') {
        await sessionsAPI.resume(id);
      } else {
        await sessionsAPI.pause(id);
      }
      await loadSession();
    } catch (error) {
      console.error('Failed to pause/resume:', error);
      alert('Failed to update session status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    try {
      setActionLoading(true);
      await sessionsAPI.healthCheck(id);
      await loadHealth();
      alert('Health check completed successfully!');
    } catch (error) {
      console.error('Failed to run health check:', error);
      alert('Failed to run health check.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      setActionLoading(true);
      const response = await sessionsAPI.verify(id);
      alert(response.data.message || 'Connection verified successfully!');
      await loadSession();
    } catch (error) {
      console.error('Failed to verify connection:', error);
      alert('Failed to verify connection.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete session "${session.name}"?`)) {
      return;
    }

    try {
      await sessionsAPI.delete(id);
      navigate('/sessions');
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete session.');
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

  const getHealthScore = (score) => {
    if (score >= 80) return { text: 'Excellent', color: 'text-green-600' };
    if (score >= 60) return { text: 'Good', color: 'text-blue-600' };
    if (score >= 40) return { text: 'Fair', color: 'text-yellow-600' };
    return { text: 'Poor', color: 'text-red-600' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Session not found.</p>
        <Link to="/sessions" className="mt-4 inline-block text-primary-600 hover:underline">
          Back to Sessions
        </Link>
      </div>
    );
  }

  const statusBadge = getStatusBadge(session.status);
  const healthScore = getHealthScore(session.health_score || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">{session.name}</h1>
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full ${statusBadge.bg} ${statusBadge.color}`}
            >
              {statusBadge.text}
            </span>
          </div>
          <p className="text-gray-500">{session.phone_number}</p>
        </div>

        <div className="flex gap-2">
          <Link
            to={`/sessions/${id}/edit`}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Edit
          </Link>
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Session Info Card */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Session Information</h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">WAHA Session</dt>
                <dd className="mt-1 text-sm text-gray-900">{session.waha_session_name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">WAHA URL</dt>
                <dd className="mt-1 text-sm text-gray-900">{session.waha_base_url}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Account Age</dt>
                <dd className="mt-1 text-sm text-gray-900 capitalize">{session.account_age}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Daily Quota</dt>
                <dd className="mt-1 text-sm text-gray-900">{session.daily_quota} messages</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Created</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(session.created_at).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(session.updated_at).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Health Info Card */}
          {health && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Health Metrics</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Health Score</span>
                    <span className={`text-2xl font-bold ${healthScore.color}`}>
                      {session.health_score || 0}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        session.health_score >= 80
                          ? 'bg-green-500'
                          : session.health_score >= 60
                          ? 'bg-blue-500'
                          : session.health_score >= 40
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${session.health_score || 0}%` }}
                    ></div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{healthScore.text}</p>
                </div>

                <dl className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Daily Sent</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">
                      {session.daily_sent_count || 0} / {session.daily_quota}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Success Rate</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">
                      {session.success_rate ? `${session.success_rate.toFixed(1)}%` : 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Total Sent</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">
                      {session.total_sent || 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Total Failed</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">
                      {session.total_failed || 0}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>

        {/* Actions sidebar */}
        <div className="space-y-6">
          {/* Actions Card */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-3">
              {session.status !== 'disconnected' && (
                <button
                  onClick={handlePauseResume}
                  disabled={actionLoading}
                  className={`w-full px-4 py-2 text-sm font-medium rounded-lg ${
                    session.status === 'paused'
                      ? 'text-green-600 bg-green-50 hover:bg-green-100'
                      : 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100'
                  }`}
                >
                  {session.status === 'paused' ? 'Resume Session' : 'Pause Session'}
                </button>
              )}

              <button
                onClick={handleVerify}
                disabled={actionLoading}
                className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
              >
                Verify Connection
              </button>

              <button
                onClick={handleHealthCheck}
                disabled={actionLoading}
                className="w-full px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100"
              >
                Run Health Check
              </button>

              <button
                onClick={loadQRCode}
                disabled={actionLoading}
                className="w-full px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
              >
                Show QR Code
              </button>
            </div>
          </div>

          {/* QR Code Card */}
          {qrCode && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">QR Code</h2>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <img src={qrCode} alt="WhatsApp QR Code" className="w-full" />
              </div>
              <p className="mt-2 text-xs text-gray-500 text-center">
                Scan with WhatsApp to connect
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Back button */}
      <div className="pt-4 border-t border-gray-200">
        <Link
          to="/sessions"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          ← Back to Sessions
        </Link>
      </div>
    </div>
  );
}
