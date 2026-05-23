import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { campaignsAPI, sessionsAPI } from '../../services/api';
import api from '../../services/api';

export function CampaignForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    message_template: '',
    message_variations: '',
    sender_session_ids: [],
  });
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Fetch available sessions
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoadingSessions(true);
      const response = await sessionsAPI.getAll();
      setSessions(response.data.sessions || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('Failed to load WhatsApp sessions. Please refresh the page.');
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSessionToggle = (sessionId) => {
    setFormData(prev => {
      const currentIds = prev.sender_session_ids;
      const newIds = currentIds.includes(sessionId)
        ? currentIds.filter(id => id !== sessionId)
        : [...currentIds, sessionId];

      return {
        ...prev,
        sender_session_ids: newIds
      };
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      e.target.value = '';
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Only JPG, PNG, and PDF files are allowed');
      e.target.value = '';
      return;
    }

    setAttachmentFile(file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachmentPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview(null); // PDF - no preview
    }
  };

  const removeAttachment = () => {
    setAttachmentFile(null);
    setAttachmentPreview(null);
    // Reset file input
    const fileInput = document.getElementById('attachment-input');
    if (fileInput) fileInput.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (formData.sender_session_ids.length === 0) {
      setError('Please select at least one WhatsApp session');
      return;
    }

    setLoading(true);

    try {
      // Upload attachment if exists
      let attachment_url = null;
      if (attachmentFile) {
        setUploadingAttachment(true);
        const uploadFormData = new FormData();
        uploadFormData.append('file', attachmentFile);

        const uploadResponse = await api.post('/campaigns/attachments/upload', uploadFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        attachment_url = uploadResponse.data.url;
        setUploadingAttachment(false);
      }

      // Parse message variations (comma-separated)
      const variations = formData.message_variations
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);

      const campaignData = {
        name: formData.name,
        message_template: formData.message_template,
        message_variations: variations.length > 0 ? variations : [],
        sender_session_ids: formData.sender_session_ids,
        attachment_url
      };

      const response = await campaignsAPI.create(campaignData);

      // Redirect to campaign detail
      navigate(`/campaigns/${response.data.campaign.id}`);
    } catch (err) {
      console.error('Failed to create campaign:', err);
      setError(
        err.response?.data?.message ||
        err.response?.data?.errors?.join(', ') ||
        'Failed to create campaign. Please check your input and try again.'
      );
    } finally {
      setLoading(false);
      setUploadingAttachment(false);
    }
  };

  const getSessionStatusBadge = (status) => {
    const badges = {
      connected: { text: 'Connected', bg: 'bg-green-100', color: 'text-green-800' },
      disconnected: { text: 'Disconnected', bg: 'bg-gray-100', color: 'text-gray-600' },
      paused: { text: 'Paused', bg: 'bg-yellow-100', color: 'text-yellow-800' },
    };
    return badges[status] || badges.disconnected;
  };

  if (loadingSessions) {
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
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/campaigns')}
          className="text-gray-600 hover:text-gray-900 flex items-center"
        >
          ← Back to Campaigns
        </button>
      </div>

      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Create New Campaign
        </h1>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {sessions.length === 0 && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 font-medium">No WhatsApp sessions found</p>
            <p className="text-yellow-700 text-sm mt-1">
              You need to add at least one WhatsApp session before creating a campaign.
              Please contact your administrator.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campaign Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Campaign Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="e.g., Product Launch Campaign"
            />
          </div>

          {/* Message Template */}
          <div>
            <label htmlFor="message_template" className="block text-sm font-medium text-gray-700 mb-2">
              Message Template *
            </label>
            <textarea
              id="message_template"
              name="message_template"
              required
              value={formData.message_template}
              onChange={handleChange}
              rows="5"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Hi {{name}}, we have exciting news for you!"
            />
            <p className="mt-2 text-sm text-gray-500">
              Use variables: <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{phone}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{greeting}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{custom_field1}}'}</code>, etc.
            </p>
            <p className="mt-1 text-sm text-gray-400">
              <code>{'{{greeting}}'}</code> = time-based greeting (pagi/siang/sore/malam)
            </p>
          </div>

          {/* Message Variations (Optional) */}
          <div>
            <label htmlFor="message_variations" className="block text-sm font-medium text-gray-700 mb-2">
              Message Variations (Optional)
            </label>
            <textarea
              id="message_variations"
              name="message_variations"
              value={formData.message_variations}
              onChange={handleChange}
              rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Variation 1, Variation 2, Variation 3"
            />
            <p className="mt-2 text-sm text-gray-500">
              Separate multiple variations with commas. System will rotate between them for anti-ban.
            </p>
          </div>

          {/* Attachment Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Attachment (Optional)
            </label>

            <input
              type="file"
              id="attachment-input"
              accept="image/jpeg,image/png,application/pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />

            <p className="mt-1 text-sm text-gray-500">
              Supported: JPG, PNG, PDF (max 5MB)
            </p>

            {/* Preview */}
            {attachmentFile && (
              <div className="mt-3 p-3 bg-gray-50 rounded-md flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {attachmentPreview ? (
                    <img
                      src={attachmentPreview}
                      alt="Preview"
                      className="w-16 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                      <span className="text-xs text-gray-500">PDF</span>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {attachmentFile.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(attachmentFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeAttachment}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Sender Sessions Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select WhatsApp Sessions * (Choose at least one)
            </label>

            {sessions.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-4">
                {sessions.map((session) => {
                  const badge = getSessionStatusBadge(session.status);
                  const isSelected = formData.sender_session_ids.includes(session.id);
                  const isAvailable = session.status === 'connected';

                  return (
                    <label
                      key={session.id}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50'
                          : isAvailable
                          ? 'border-gray-200 hover:border-gray-300 bg-white'
                          : 'border-gray-200 bg-gray-50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSessionToggle(session.id)}
                          disabled={!isAvailable}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <div className="ml-3">
                          <p className="font-medium text-gray-900">
                            {session.session_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {session.phone_number} • {session.account_age} • Quota: {session.daily_quota}/day
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.color}`}>
                        {badge.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No sessions available</p>
            )}

            {formData.sender_session_ids.length > 0 && (
              <p className="mt-2 text-sm text-green-600">
                ✓ {formData.sender_session_ids.length} session(s) selected
              </p>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/campaigns')}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              disabled={loading || uploadingAttachment || sessions.length === 0}
            >
              {uploadingAttachment ? 'Uploading attachment...' : loading ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Next Steps:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Create the campaign with selected sessions</li>
          <li>Import contacts (CSV file)</li>
          <li>Review and start the campaign</li>
        </ol>
      </div>
    </div>
  );
}

export default CampaignForm;
