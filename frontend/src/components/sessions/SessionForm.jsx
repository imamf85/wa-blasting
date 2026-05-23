import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionsAPI } from '../../services/api';

export default function SessionForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone_number: '',
    waha_session_name: '',
    waha_base_url: '',
    account_age: 'new',
    daily_quota: 50,
  });

  useEffect(() => {
    if (isEditMode) {
      loadSession();
    }
  }, [id]);

  const loadSession = async () => {
    try {
      setLoading(true);
      const response = await sessionsAPI.getOne(id);
      const session = response.data.session;
      setFormData({
        name: session.name,
        phone_number: session.phone_number,
        waha_session_name: session.waha_session_name,
        waha_base_url: session.waha_base_url,
        account_age: session.account_age,
        daily_quota: session.daily_quota,
      });
    } catch (error) {
      console.error('Failed to load session:', error);
      alert('Failed to load session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      if (isEditMode) {
        await sessionsAPI.update(id, formData);
      } else {
        await sessionsAPI.create(formData);
      }

      navigate('/sessions');
    } catch (error) {
      console.error('Failed to save session:', error);
      alert(
        error.response?.data?.error ||
        'Failed to save session. Please check your input and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const quotaByAge = {
    new: 50,
    medium: 150,
    aged: 300,
  };

  const handleAccountAgeChange = (e) => {
    const age = e.target.value;
    setFormData((prev) => ({
      ...prev,
      account_age: age,
      daily_quota: quotaByAge[age],
    }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          {isEditMode ? 'Edit Session' : 'Create New Session'}
        </h1>
        <p className="text-gray-500 mt-1">
          {isEditMode
            ? 'Update WhatsApp session details'
            : 'Connect a new WhatsApp account for sending messages'
          }
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Session Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Session Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="e.g., Primary Sender"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500">
            A friendly name to identify this session
          </p>
        </div>

        {/* Phone Number */}
        <div>
          <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number *
          </label>
          <input
            type="text"
            id="phone_number"
            name="phone_number"
            value={formData.phone_number}
            onChange={handleChange}
            required
            placeholder="e.g., 628123456789"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500">
            WhatsApp phone number in international format (without +)
          </p>
        </div>

        {/* WAHA Session Name */}
        <div>
          <label htmlFor="waha_session_name" className="block text-sm font-medium text-gray-700 mb-2">
            WAHA Session Name *
          </label>
          <input
            type="text"
            id="waha_session_name"
            name="waha_session_name"
            value={formData.waha_session_name}
            onChange={handleChange}
            required
            placeholder="e.g., default"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500">
            Session name in your WAHA instance
          </p>
        </div>

        {/* WAHA Base URL */}
        <div>
          <label htmlFor="waha_base_url" className="block text-sm font-medium text-gray-700 mb-2">
            WAHA Base URL *
          </label>
          <input
            type="url"
            id="waha_base_url"
            name="waha_base_url"
            value={formData.waha_base_url}
            onChange={handleChange}
            required
            placeholder="e.g., http://localhost:3000"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500">
            Full URL to your WAHA API instance
          </p>
        </div>

        {/* Account Age */}
        <div>
          <label htmlFor="account_age" className="block text-sm font-medium text-gray-700 mb-2">
            Account Age *
          </label>
          <select
            id="account_age"
            name="account_age"
            value={formData.account_age}
            onChange={handleAccountAgeChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="new">New (&lt; 1 month) - 50 msg/day</option>
            <option value="medium">Medium (1-3 months) - 150 msg/day</option>
            <option value="aged">Aged (&gt; 3 months) - 300 msg/day</option>
          </select>
          <p className="mt-1 text-sm text-gray-500">
            Account age determines the safe daily message quota
          </p>
        </div>

        {/* Daily Quota */}
        <div>
          <label htmlFor="daily_quota" className="block text-sm font-medium text-gray-700 mb-2">
            Daily Quota *
          </label>
          <input
            type="number"
            id="daily_quota"
            name="daily_quota"
            value={formData.daily_quota}
            onChange={handleChange}
            required
            min="1"
            max="500"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500">
            Maximum messages this session can send per day
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate('/sessions')}
            className="flex-1 px-6 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 btn-primary"
          >
            {loading ? 'Saving...' : isEditMode ? 'Update Session' : 'Create Session'}
          </button>
        </div>
      </form>

      {/* Help card */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          💡 Setup Instructions
        </h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Make sure WAHA is running and accessible</li>
          <li>Create a session in WAHA using the session name above</li>
          <li>After creating, scan the QR code to connect your WhatsApp</li>
          <li>Start sending messages once the session is active</li>
        </ol>
      </div>
    </div>
  );
}
