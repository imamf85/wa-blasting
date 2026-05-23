import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { campaignsAPI, contactsAPI } from '../../services/api';
import LiveProgress from '../dashboard/LiveProgress';

export function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [campaign, setCampaign] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  useEffect(() => {
    loadCampaign();
  }, [id]);

  const loadCampaign = async () => {
    try {
      setLoading(true);
      const [campaignRes, statsRes] = await Promise.all([
        campaignsAPI.getOne(id),
        campaignsAPI.getStats(id),
      ]);

      setCampaign(campaignRes.data.campaign);
      setStats(statsRes.data.stats || statsRes.data);
    } catch (error) {
      console.error('Failed to load campaign:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleImportContacts(file);
    }
  };

  const handleImportContacts = async (file) => {
    setUploadError(null);
    setUploadSuccess(null);

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setUploadError('Please upload a CSV file');
      return;
    }

    setUploading(true);

    try {
      const response = await contactsAPI.import(id, file);
      const { imported, failed, total } = response.data;

      setUploadSuccess(`Successfully imported ${imported} of ${total} contacts`);

      if (failed > 0) {
        setUploadError(`${failed} contacts failed to import`);
      }

      // Reload campaign to update contact count
      setTimeout(() => {
        loadCampaign();
        setUploadSuccess(null);
      }, 3000);

    } catch (error) {
      console.error('Failed to import contacts:', error);
      setUploadError(
        error.response?.data?.message ||
        'Failed to import contacts. Please check your CSV format.'
      );
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleStart = async () => {
    if (campaign.total_contacts === 0) {
      alert('Please import contacts before starting the campaign');
      return;
    }

    if (!confirm('Start this campaign? Messages will begin sending immediately.')) {
      return;
    }

    try {
      await campaignsAPI.start(id);
      loadCampaign();
    } catch (error) {
      alert('Failed to start campaign: ' + (error.response?.data?.message || error.message));
    }
  };

  const handlePause = async () => {
    if (!confirm('Pause this campaign?')) {
      return;
    }

    try {
      await campaignsAPI.pause(id);
      loadCampaign();
    } catch (error) {
      alert('Failed to pause campaign: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleResume = async () => {
    if (!confirm('Resume this campaign? Sending will continue.')) {
      return;
    }

    try {
      await campaignsAPI.resume(id);
      loadCampaign();
    } catch (error) {
      alert('Failed to resume campaign: ' + (error.response?.data?.message || error.message));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading campaign...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Campaign not found</p>
        <button onClick={() => navigate('/campaigns')} className="btn-primary mt-4">
          Back to Campaigns
        </button>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const badges = {
      draft: { text: 'Draft', bg: 'bg-gray-100', color: 'text-gray-800' },
      active: { text: 'Active', bg: 'bg-green-100', color: 'text-green-800' },
      paused: { text: 'Paused', bg: 'bg-yellow-100', color: 'text-yellow-800' },
      completed: { text: 'Completed', bg: 'bg-blue-100', color: 'text-blue-800' },
    };
    return badges[status] || badges.draft;
  };

  const statusBadge = getStatusBadge(campaign.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/campaigns')}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-gray-900">
              {campaign.name}
            </h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusBadge.bg} ${statusBadge.color}`}>
              {statusBadge.text}
            </span>
          </div>
          <p className="text-gray-500 mt-2">
            Created {new Date(campaign.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {campaign.status === 'draft' && (
            <button onClick={handleStart} className="btn-success">
              Start Campaign
            </button>
          )}

          {campaign.status === 'active' && (
            <button onClick={handlePause} className="btn-danger">
              Pause Campaign
            </button>
          )}

          {campaign.status === 'paused' && (
            <button onClick={handleResume} className="btn-success">
              Resume Campaign
            </button>
          )}
        </div>
      </div>

      {/* Contact Import Section */}
      {campaign.status === 'draft' && (
        <div className="card bg-blue-50 border border-blue-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">
                📋 Import Contacts
              </h3>
              <p className="text-sm text-blue-700 mb-4">
                Upload a CSV file with your contact list. Required columns: <code className="bg-blue-100 px-1 rounded">name</code>, <code className="bg-blue-100 px-1 rounded">phone_number</code>
              </p>

              {uploadSuccess && (
                <div className="mb-3 p-3 bg-green-100 border border-green-300 rounded-lg">
                  <p className="text-green-800 text-sm">✓ {uploadSuccess}</p>
                </div>
              )}

              {uploadError && (
                <div className="mb-3 p-3 bg-red-100 border border-red-300 rounded-lg">
                  <p className="text-red-800 text-sm">✗ {uploadError}</p>
                </div>
              )}

              <div className="flex items-center space-x-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer inline-block ${
                    uploading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {uploading ? 'Uploading...' : '📁 Choose CSV File'}
                </label>

                {campaign.total_contacts > 0 && (
                  <span className="text-sm text-blue-700">
                    Current: {campaign.total_contacts} contacts
                  </span>
                )}
              </div>

              <details className="mt-4">
                <summary className="text-sm text-blue-700 cursor-pointer hover:text-blue-900">
                  CSV Format Example
                </summary>
                <pre className="mt-2 p-3 bg-blue-100 rounded text-xs text-blue-900 overflow-x-auto">
{`name,phone_number,custom_field1,custom_field2
John Doe,6281234567890,Jakarta,Premium
Jane Smith,6289876543210,Bandung,Regular
Bob Johnson,6285555555555,Surabaya,Premium`}
                </pre>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* Live Progress (only for active/paused campaigns) */}
      {(campaign.status === 'active' || campaign.status === 'paused') && stats && (
        <LiveProgress campaignId={id} initialStats={stats} />
      )}

      {/* Campaign Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Template */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Message Template
          </h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="whitespace-pre-wrap text-sm text-gray-700">
              {campaign.message_template}
            </pre>
          </div>

          {campaign.message_variations && campaign.message_variations.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">
                + {campaign.message_variations.length} variations
              </p>
            </div>
          )}
        </div>

        {/* Campaign Settings */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Settings
          </h3>

          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">Delay Range</dt>
              <dd className="text-sm font-medium text-gray-900">
                {campaign.delay_min} - {campaign.delay_max} seconds
              </dd>
            </div>

            <div>
              <dt className="text-sm text-gray-500">Peak Hours Avoidance</dt>
              <dd className="text-sm font-medium text-gray-900">
                {campaign.avoid_peak_hours ? 'Enabled' : 'Disabled'}
                {campaign.avoid_peak_hours && campaign.peak_hours_start && (
                  <span className="text-xs text-gray-500 ml-2">
                    ({campaign.peak_hours_start} - {campaign.peak_hours_end})
                  </span>
                )}
              </dd>
            </div>

            <div>
              <dt className="text-sm text-gray-500">Sender Sessions</dt>
              <dd className="text-sm font-medium text-gray-900">
                {campaign.sender_session_ids?.length || 0} sessions
              </dd>
            </div>

            <div>
              <dt className="text-sm text-gray-500">Total Contacts</dt>
              <dd className={`text-sm font-medium ${
                campaign.total_contacts > 0 ? 'text-green-600' : 'text-gray-400'
              }`}>
                {campaign.total_contacts?.toLocaleString() || 0}
                {campaign.total_contacts === 0 && campaign.status === 'draft' && (
                  <span className="text-xs text-red-500 ml-2">
                    (Import contacts to start)
                  </span>
                )}
              </dd>
            </div>

            {campaign.started_at && (
              <div>
                <dt className="text-sm text-gray-500">Started At</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {new Date(campaign.started_at).toLocaleString()}
                </dd>
              </div>
            )}

            {campaign.completed_at && (
              <div>
                <dt className="text-sm text-gray-500">Completed At</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {new Date(campaign.completed_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Statistics (for completed campaigns) */}
      {campaign.status === 'completed' && stats && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Final Statistics
          </h3>

          <div className="grid grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">
                {stats.total?.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500 mt-2">Total Contacts</div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {stats.sent?.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500 mt-2">Successfully Sent</div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {stats.failed?.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500 mt-2">Failed</div>
            </div>

            <div className="text-center">
              <div className={`text-3xl font-bold ${
                ((stats.sent / stats.total) * 100) >= 95 ? 'text-green-600' :
                ((stats.sent / stats.total) * 100) >= 85 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {((stats.sent / stats.total) * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500 mt-2">Success Rate</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CampaignDetail;
