export function SessionHealthCard({ session }) {
  const getHealthColor = (score) => {
    if (score >= 0.9) return 'text-green-600';
    if (score >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthBadge = (score) => {
    if (score >= 0.9) return { text: 'Excellent', bg: 'bg-green-100', color: 'text-green-800' };
    if (score >= 0.7) return { text: 'Good', bg: 'bg-yellow-100', color: 'text-yellow-800' };
    return { text: 'Poor', bg: 'bg-red-100', color: 'text-red-800' };
  };

  const getStatusBadge = (status) => {
    const badges = {
      connected: { text: 'Connected', bg: 'bg-green-100', color: 'text-green-800' },
      disconnected: { text: 'Disconnected', bg: 'bg-gray-100', color: 'text-gray-800' },
      paused: { text: 'Paused', bg: 'bg-yellow-100', color: 'text-yellow-800' },
    };
    return badges[status] || badges.disconnected;
  };

  const healthBadge = getHealthBadge(session.health_score);
  const statusBadge = getStatusBadge(session.status);
  const quotaPercentage = (session.messages_sent_today / session.daily_quota) * 100;

  return (
    <div className="card hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            {session.session_name}
          </h3>
          <p className="text-sm text-gray-500">
            {session.phone_number}
          </p>
        </div>

        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.color}`}>
          {statusBadge.text}
        </span>
      </div>

      {/* Health Score */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Health Score</span>
          <div className="flex items-center space-x-2">
            <span className={`text-xl font-bold ${getHealthColor(session.health_score)}`}>
              {(session.health_score * 100).toFixed(0)}%
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${healthBadge.bg} ${healthBadge.color}`}>
              {healthBadge.text}
            </span>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              session.health_score >= 0.9 ? 'bg-green-600' :
              session.health_score >= 0.7 ? 'bg-yellow-600' :
              'bg-red-600'
            }`}
            style={{ width: `${session.health_score * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Quota Usage */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Quota Usage Today</span>
          <span className="text-sm font-medium text-gray-900">
            {session.messages_sent_today} / {session.daily_quota}
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              quotaPercentage < 70 ? 'bg-green-600' :
              quotaPercentage < 90 ? 'bg-yellow-600' :
              'bg-red-600'
            }`}
            style={{ width: `${Math.min(quotaPercentage, 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
        <div>
          <div className="text-xs text-gray-500 mb-1">Messages Today</div>
          <div className="text-lg font-semibold text-gray-900">
            {session.messages_sent_today}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Errors Today</div>
          <div className="text-lg font-semibold text-red-600">
            {session.error_count_today || 0}
          </div>
        </div>
      </div>

      {/* Pause Reason */}
      {session.status === 'paused' && session.pause_reason && (
        <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
          <p className="text-xs text-yellow-800">
            <strong>Paused:</strong> {session.pause_reason}
          </p>
        </div>
      )}

      {/* Last Activity */}
      {session.last_message_at && (
        <div className="mt-4 text-xs text-gray-500">
          Last activity: {new Date(session.last_message_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default SessionHealthCard;
