-- WhatsApp Blast Management System - Initial Schema
-- Run this migration in Supabase SQL Editor

-- =====================================================
-- 1. USER PROFILES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for role-based queries
CREATE INDEX idx_user_profiles_role ON user_profiles(role);

-- =====================================================
-- 2. WAHA SESSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS waha_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL,
  waha_api_url TEXT NOT NULL,
  waha_api_key TEXT,

  -- Status and health
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'paused', 'error')),
  health_score DECIMAL(3,2) DEFAULT 1.0 CHECK (health_score >= 0 AND health_score <= 1),

  -- Account configuration
  account_age TEXT NOT NULL DEFAULT 'medium' CHECK (account_age IN ('new', 'medium', 'aged')),
  daily_quota INTEGER NOT NULL DEFAULT 150,

  -- Usage tracking
  messages_sent_today INTEGER DEFAULT 0,
  error_count_today INTEGER DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_error_at TIMESTAMP WITH TIME ZONE,

  -- Pause management
  paused_at TIMESTAMP WITH TIME ZONE,
  pause_reason TEXT,

  -- Metadata
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_status ON waha_sessions(status);
CREATE INDEX idx_sessions_health ON waha_sessions(health_score DESC);
CREATE INDEX idx_sessions_phone ON waha_sessions(phone_number);

-- =====================================================
-- 3. CAMPAIGNS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Message configuration
  message_template TEXT NOT NULL,
  message_variations TEXT[] DEFAULT '{}',
  attachment_url TEXT,

  -- Sending configuration
  delay_min INTEGER DEFAULT 20 CHECK (delay_min >= 10),
  delay_max INTEGER DEFAULT 90 CHECK (delay_max >= delay_min),
  avoid_peak_hours BOOLEAN DEFAULT TRUE,
  peak_hours_start TIME DEFAULT '09:00:00',
  peak_hours_end TIME DEFAULT '17:00:00',

  -- Session assignment
  sender_session_ids UUID[] NOT NULL DEFAULT '{}',

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),

  -- Statistics
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  queued_count INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  scheduled_for TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_created_by ON campaigns(created_by);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);

-- =====================================================
-- 4. CONTACTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Contact information
  phone_number TEXT NOT NULL,
  name TEXT,
  custom_fields JSONB DEFAULT '{}',

  -- Message details
  final_message TEXT,
  assigned_session_id UUID REFERENCES waha_sessions(id) ON DELETE SET NULL,

  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sending', 'sent', 'failed')),

  -- WAHA integration
  waha_message_id TEXT,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  queued_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_session ON contacts(assigned_session_id);
CREATE INDEX idx_contacts_phone ON contacts(phone_number);

-- =====================================================
-- 5. DELIVERY LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES waha_sessions(id) ON DELETE SET NULL,

  event_type TEXT NOT NULL CHECK (event_type IN ('queued', 'sending', 'sent', 'failed', 'retry')),

  -- Response data
  waha_response JSONB,
  error_message TEXT,

  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX idx_delivery_logs_campaign ON delivery_logs(campaign_id);
CREATE INDEX idx_delivery_logs_session ON delivery_logs(session_id);
CREATE INDEX idx_delivery_logs_event ON delivery_logs(event_type);
CREATE INDEX idx_delivery_logs_timestamp ON delivery_logs(timestamp DESC);

-- =====================================================
-- 6. REPORTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  report_type TEXT NOT NULL CHECK (report_type IN ('campaign_start', 'campaign_complete', 'daily_summary', 'error_alert')),

  message_text TEXT NOT NULL,
  sent_to_admin BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE,

  -- Report data
  report_data JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_reports_campaign ON reports(campaign_id);
CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);

-- =====================================================
-- 7. SYSTEM SETTINGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES user_profiles(id)
);

-- Insert default settings
INSERT INTO system_settings (key, value, description) VALUES
  ('admin_whatsapp', '087881847054', 'Admin WhatsApp number for reports'),
  ('error_threshold_per_hour', '10', 'Max errors before auto-pause'),
  ('health_check_interval_minutes', '5', 'Health check frequency'),
  ('global_rate_limit_per_minute', '10', 'Global rate limit across all sessions')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 8. MESSAGE QUEUE TABLE (for BullMQ tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES waha_sessions(id) ON DELETE CASCADE,

  -- BullMQ job tracking
  job_id TEXT NOT NULL,
  queue_name TEXT DEFAULT 'messages',

  -- Scheduling
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  delay_seconds INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Processing
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_message_queue_contact ON message_queue(contact_id);
CREATE INDEX idx_message_queue_status ON message_queue(status);
CREATE INDEX idx_message_queue_scheduled ON message_queue(scheduled_for);

-- =====================================================
-- 9. TRIGGERS FOR UPDATED_AT
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_waha_sessions_updated_at BEFORE UPDATE ON waha_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 10. FUNCTIONS FOR CAMPAIGN STATS
-- =====================================================
CREATE OR REPLACE FUNCTION update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update campaign statistics when contact status changes
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) OR TG_OP = 'INSERT' THEN
    UPDATE campaigns
    SET
      sent_count = (SELECT COUNT(*) FROM contacts WHERE campaign_id = NEW.campaign_id AND status = 'sent'),
      failed_count = (SELECT COUNT(*) FROM contacts WHERE campaign_id = NEW.campaign_id AND status = 'failed'),
      queued_count = (SELECT COUNT(*) FROM contacts WHERE campaign_id = NEW.campaign_id AND status IN ('queued', 'sending')),
      updated_at = NOW()
    WHERE id = NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_stats_trigger
AFTER INSERT OR UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_campaign_stats();

-- =====================================================
-- 11. FUNCTION FOR DAILY RESET
-- =====================================================
CREATE OR REPLACE FUNCTION reset_daily_session_counters()
RETURNS void AS $$
BEGIN
  UPDATE waha_sessions
  SET
    messages_sent_today = 0,
    error_count_today = 0,
    updated_at = NOW();

  -- Optionally resume auto-paused sessions
  UPDATE waha_sessions
  SET
    status = 'connected',
    paused_at = NULL,
    pause_reason = NULL
  WHERE status = 'paused'
    AND pause_reason LIKE '%Auto-paused%';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 12. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE waha_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
CREATE POLICY "Users can view all profiles" ON user_profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Policies for waha_sessions (all authenticated users can view, admin/operator can modify)
CREATE POLICY "Authenticated users can view sessions" ON waha_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and operators can insert sessions" ON waha_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'operator')
    )
  );

CREATE POLICY "Admin and operators can update sessions" ON waha_sessions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'operator')
    )
  );

CREATE POLICY "Admin can delete sessions" ON waha_sessions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policies for campaigns
CREATE POLICY "Authenticated users can view campaigns" ON campaigns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and operators can manage campaigns" ON campaigns
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'operator')
    )
  );

-- Policies for contacts
CREATE POLICY "Authenticated users can view contacts" ON contacts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and operators can manage contacts" ON contacts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'operator')
    )
  );

-- Policies for delivery_logs
CREATE POLICY "Authenticated users can view logs" ON delivery_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can insert logs" ON delivery_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Policies for reports
CREATE POLICY "Authenticated users can view reports" ON reports
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can insert reports" ON reports
  FOR INSERT TO authenticated WITH CHECK (true);

-- Policies for system_settings
CREATE POLICY "Authenticated users can view settings" ON system_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage settings" ON system_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policies for message_queue
CREATE POLICY "Authenticated users can view queue" ON message_queue
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can manage queue" ON message_queue
  FOR ALL TO authenticated WITH CHECK (true);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next steps:
-- 1. Create admin user in Supabase Auth Dashboard
-- 2. Insert user_profile record with role='admin'
-- 3. Insert WAHA sessions manually or via API
