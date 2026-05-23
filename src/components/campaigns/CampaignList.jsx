import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { campaignsAPI } from '../../services/api';

export function CampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadCampaigns();
  }, [filter]);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const params = filter !== 'all' ? { status: filter } : {};
      const response = await campaignsAPI.getAll(params);
      setCampaigns(response.data.campaigns);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: { text: 'Draft', bg: 'bg-gray-100', color: 'text-gray-800' },
      active: { text: 'Active', bg: 'bg-green-100', color: 'text-green-800' },
      paused: { text: 'Paused', bg: 'bg-yellow-100', color: 'text-yellow-800' },
      completed: { text: 'Completed', bg: 'bg-blue-100', color: 'text-blue-800' },
    };
    return badges[status] || badges.draft;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading campaigns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 mt-1">
            Manage your WhatsApp blast campaigns
          </p>
        </div>

        <Link to="/campaigns/new" className="btn-primary">
          + New Campaign
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex space-x-2 border-b border-gray-200">
        {['all', 'active', 'completed', 'paused', 'draft'].map((status) => (
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

      {/* Campaigns list */}
      {campaigns.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((campaign) => {
            const statusBadge = getStatusBadge(campaign.status);
            const progress = campaign.total_contacts > 0
              ? ((campaign.sent_count + campaign.failed_count) / campaign.total_contacts) * 100
              : 0;
            const successRate = (campaign.sent_count + campaign.failed_count) > 0
              ? (campaign.sent_count / (campaign.sent_count + campaign.failed_count)) * 100
              : 0;

            return (
              <Link
                key={campaign.id}
                to={`/campaigns/${campaign.id}`}
                className="card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {campaign.name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Created {new Date(campaign.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.color}`}>
                    {statusBadge.text}
                  </span>
                </div>

                {/* Progress */}
                {campaign.status !== 'draft' && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>
                        {campaign.sent_count + campaign.failed_count} / {campaign.total_contacts}
                      </span>
                      <span>{progress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary-600 h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {campaign.total_contacts}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-1">Sent</div>
                    <div className="text-lg font-semibold text-green-600">
                      {campaign.sent_count}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-1">Failed</div>
                    <div className="text-lg font-semibold text-red-600">
                      {campaign.failed_count}
                    </div>
                  </div>
                </div>

                {/* Success rate */}
                {campaign.status === 'completed' && (
                  <div className="mt-4 text-center">
                    <span className={`text-sm font-medium ${
                      successRate >= 95 ? 'text-green-600' :
                      successRate >= 85 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {successRate.toFixed(1)}% Success Rate
                    </span>
                  </div>
                )}

                {/* Started/Completed time */}
                {campaign.started_at && (
                  <div className="mt-4 text-xs text-gray-500">
                    {campaign.status === 'completed' ? 'Completed' : 'Started'}{' '}
                    {new Date(campaign.status === 'completed' ? campaign.completed_at : campaign.started_at).toLocaleString()}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-500">No campaigns found</p>
          <p className="text-sm text-gray-400 mt-2">
            Create your first campaign to start sending messages
          </p>
          <Link to="/campaigns/new" className="btn-primary mt-4 inline-block">
            + New Campaign
          </Link>
        </div>
      )}
    </div>
  );
}

export default CampaignList;
