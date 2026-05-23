import { useEffect, useState } from 'react';
import { useCampaignStream, useCampaignStats } from '../../hooks/useRealtime';
import { campaignsAPI } from '../../services/api';

export function LiveProgress({ campaignId, initialStats }) {
  const { isConnected, error } = useCampaignStream(campaignId);
  const realtimeStats = useCampaignStats(campaignId);

  // Normalize initial stats with defaults
  const normalizedInitialStats = {
    total: initialStats?.total || 0,
    sent: initialStats?.sent || 0,
    failed: initialStats?.failed || 0,
    queued: initialStats?.queued || initialStats?.pending || 0,
  };

  const [stats, setStats] = useState(normalizedInitialStats);

  // Merge initial stats with real-time updates
  useEffect(() => {
    if (realtimeStats.sent > 0 || realtimeStats.failed > 0) {
      setStats((prev) => ({
        total: prev.total || normalizedInitialStats.total,
        sent: (normalizedInitialStats.sent || 0) + realtimeStats.sent,
        failed: (normalizedInitialStats.failed || 0) + realtimeStats.failed,
        queued: Math.max(0, (normalizedInitialStats.queued || 0) - realtimeStats.sent - realtimeStats.failed),
      }));
    }
  }, [realtimeStats, normalizedInitialStats]);

  const total = stats.total || ((stats.sent || 0) + (stats.failed || 0) + (stats.queued || 0));
  const processed = (stats.sent || 0) + (stats.failed || 0);
  const progress = total > 0 ? (processed / total) * 100 : 0;
  const successRate = processed > 0 ? ((stats.sent || 0) / processed) * 100 : 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Campaign Progress
        </h3>

        <div className="flex items-center space-x-2">
          {isConnected ? (
            <span className="flex items-center text-sm text-green-600">
              <span className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
              Live
            </span>
          ) : error ? (
            <span className="text-sm text-red-600">
              Disconnected
            </span>
          ) : (
            <span className="text-sm text-gray-500">
              Connecting...
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>{processed.toLocaleString()} / {total.toLocaleString()}</span>
          <span>{progress.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-primary-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {(total || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Total</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {(stats.sent || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Sent</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">
            {(stats.failed || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Failed</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {(stats.queued || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Queued</div>
        </div>
      </div>

      {/* Success rate */}
      {processed > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Success Rate</span>
            <span className={`text-lg font-semibold ${
              successRate >= 95 ? 'text-green-600' :
              successRate >= 85 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {successRate.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveProgress;
