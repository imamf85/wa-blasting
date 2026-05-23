import supabase from '../config/supabase.js';
import logger from '../utils/logger.js';

/**
 * Get all reports
 */
export async function getAllReports(req, res) {
  try {
    const { report_type, campaign_id, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (report_type) {
      query = query.eq('report_type', report_type);
    }

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch reports', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch reports'
      });
    }

    res.json({
      reports: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Get reports error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch reports'
    });
  }
}

/**
 * Get single report
 */
export async function getReport(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Report not found'
      });
    }

    res.json({ report: data });
  } catch (error) {
    logger.error('Get report error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch report'
    });
  }
}

/**
 * Get reports for a specific campaign
 */
export async function getCampaignReports(req, res) {
  try {
    const { campaignId } = req.params;

    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch campaign reports', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch campaign reports'
      });
    }

    res.json({
      reports: data,
      total: data.length
    });
  } catch (error) {
    logger.error('Get campaign reports error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaign reports'
    });
  }
}

/**
 * Get report statistics
 */
export async function getReportStats(req, res) {
  try {
    const { data: reports, error } = await supabase
      .from('reports')
      .select('report_type, sent_to_admin, created_at');

    if (error) {
      logger.error('Failed to fetch report stats', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch report statistics'
      });
    }

    // Calculate statistics
    const stats = {
      total: reports.length,
      sent: reports.filter(r => r.sent_to_admin).length,
      failed: reports.filter(r => !r.sent_to_admin).length,
      byType: {},
      today: 0,
      thisWeek: 0
    };

    // Count by type
    reports.forEach(report => {
      if (!stats.byType[report.report_type]) {
        stats.byType[report.report_type] = 0;
      }
      stats.byType[report.report_type]++;

      // Count today
      const createdDate = new Date(report.created_at);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (createdDate >= today) {
        stats.today++;
      }

      // Count this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      if (createdDate >= weekAgo) {
        stats.thisWeek++;
      }
    });

    res.json({ stats });
  } catch (error) {
    logger.error('Get report stats error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch report statistics'
    });
  }
}

export default {
  getAllReports,
  getReport,
  getCampaignReports,
  getReportStats
};
