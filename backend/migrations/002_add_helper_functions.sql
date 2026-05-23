-- Helper Functions for Phase 5
-- Run this in Supabase SQL Editor

-- Function to increment session message counter
CREATE OR REPLACE FUNCTION increment_session_counter(session_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE waha_sessions
  SET
    messages_sent_today = messages_sent_today + 1,
    last_message_at = NOW(),
    updated_at = NOW()
  WHERE id = session_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION increment_session_counter(UUID) TO authenticated;

-- Function to get campaign progress
CREATE OR REPLACE FUNCTION get_campaign_progress(campaign_id_param UUID)
RETURNS TABLE (
  total INTEGER,
  sent INTEGER,
  failed INTEGER,
  queued INTEGER,
  pending INTEGER,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total,
    COUNT(*) FILTER (WHERE status = 'sent')::INTEGER as sent,
    COUNT(*) FILTER (WHERE status = 'failed')::INTEGER as failed,
    COUNT(*) FILTER (WHERE status IN ('queued', 'sending'))::INTEGER as queued,
    COUNT(*) FILTER (WHERE status = 'pending')::INTEGER as pending,
    CASE
      WHEN COUNT(*) FILTER (WHERE status IN ('sent', 'failed')) = 0 THEN 0
      ELSE ROUND(
        (COUNT(*) FILTER (WHERE status = 'sent')::NUMERIC /
         COUNT(*) FILTER (WHERE status IN ('sent', 'failed'))::NUMERIC) * 100,
        2
      )
    END as success_rate
  FROM contacts
  WHERE campaign_id = campaign_id_param;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_campaign_progress(UUID) TO authenticated;

-- Migration complete
SELECT 'Helper functions created successfully' as status;
