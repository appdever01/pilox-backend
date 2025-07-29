const { Analytics, Visitor } = require('@models');
const path = require('path');
const ADMIN_KEY = '1234';
const publicPath = path.join(__dirname, '../public');

class AdminController {
  async getAdminPage(req, res) {
    res.sendFile(path.join(publicPath, 'admin.html'));
  }

  async validate(req, res) {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey === ADMIN_KEY) {
      res.status(200).json({ valid: true });
    } else {
      res.status(401).json({ valid: false });
    }
  }

  async metrics(req, res) {
    const period = req.query.period || 'day';
    const now = new Date();
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    try {
      // Run all queries in parallel
      const [metrics, trends, activities] = await Promise.all([
        Analytics.aggregate([
          {
            $match: {
              timestamp: { $gte: startDate },
            },
          },
          {
            $group: {
              _id: '$activityType',
              count: { $sum: 1 },
            },
          },
        ]),
        Analytics.aggregate([
          {
            $match: {
              timestamp: { $gte: startDate },
            },
          },
          {
            $group: {
              _id: {
                activityType: '$activityType',
                day: {
                  $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
                },
              },
              count: { $sum: 1 },
            },
          },
          {
            $sort: { '_id.day': -1 },
          },
        ]),
        Analytics.find({}, { details: 1, timestamp: 1, activityType: 1 })
          .sort({ timestamp: -1 })
          .limit(20),
      ]);

      // Transform the data
      const metricsData = metrics.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      const trendsData = trends.reduce((acc, item) => {
        if (!acc[item._id.activityType]) {
          acc[item._id.activityType] = [];
        }
        acc[item._id.activityType].push({
          date: item._id.day,
          count: item.count,
        });
        return acc;
      }, {});

      res.json({
        metrics: metricsData,
        trends: trendsData,
        activities,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error fetching metrics:', error);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  }

  async visitors(req, res) {
    const period = req.query.period || 'day';
    const now = new Date();
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default: // day
        startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    try {
      const totalVisitors = await Visitor.countDocuments();
      const periodVisitors = await Visitor.countDocuments({
        lastVisit: { $gte: startDate },
      });

      res.json({
        total: totalVisitors,
        period: periodVisitors,
        // trend: calculateTrend(periodVisitors),
        trend: periodVisitors,
      });
    } catch (error) {
      console.error('Visitor metrics error:', error);
      res.status(500).json({ error: 'Failed to fetch visitor metrics' });
    }
  }

  async chartData(req, res) {
    try {
      const now = new Date();
      const past7Days = new Date(now.setDate(now.getDate() - 7));

      const [activityData, engagementData] = await Promise.all([
        Analytics.aggregate([
          {
            $match: {
              timestamp: { $gte: past7Days },
              activityType: { $in: ['pdf_analysis', 'query'] },
            },
          },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
                },
                type: '$activityType',
              },
              count: { $sum: 1 },
            },
          },
          {
            $sort: { '_id.date': 1 },
          },
        ]).exec(),

        Analytics.aggregate([
          {
            $match: {
              timestamp: { $gte: new Date(now.setHours(0, 0, 0, 0)) },
            },
          },
          {
            $group: {
              _id: {
                hour: { $hour: '$timestamp' },
                type: '$activityType',
              },
              count: { $sum: 1 },
            },
          },
          {
            $sort: { '_id.hour': 1 },
          },
        ]).exec(),
      ]);

      // Format the data for charts
      const formattedData = {
        activity: {
          dates: [...new Set(activityData.map((d) => d._id.date))],
          pdfs: [],
          queries: [],
        },
        hourly: engagementData,
      };

      // Process activity data
      formattedData.activity.dates.forEach((date) => {
        const pdfData = activityData.find(
          (d) => d._id.date === date && d._id.type === 'pdf_analysis'
        );
        const queryData = activityData.find(
          (d) => d._id.date === date && d._id.type === 'query'
        );
        formattedData.activity.pdfs.push(pdfData ? pdfData.count : 0);
        formattedData.activity.queries.push(queryData ? queryData.count : 0);
      });

      res.json(formattedData);
    } catch (error) {
      console.error('Error fetching chart data:', error);
      res.status(500).json({ error: 'Failed to fetch chart data' });
    }
  }

  async detailedAnalytics(req, res) {
    try {
      const now = new Date();
      const past24Hours = new Date(now - 24 * 60 * 60 * 1000);

      const [hourlyAnalytics, recentActivities] = await Promise.all([
        Analytics.aggregate([
          {
            $match: {
              timestamp: { $gte: past24Hours },
            },
          },
          {
            $group: {
              _id: {
                hour: { $hour: '$timestamp' },
                activityType: '$activityType',
              },
              count: { $sum: 1 },
            },
          },
          {
            $sort: { '_id.hour': 1 },
          },
        ]),
        Analytics.find(
          { timestamp: { $gte: past24Hours } },
          { details: 1, timestamp: 1, activityType: 1 }
        )
          .sort({ timestamp: -1 })
          .limit(20),
      ]);

      res.json({
        hourlyAnalytics,
        recentActivities,
      });
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }

  async visitorCountries(req, res) {
    const period = req.query.period || 'day';
    const now = new Date();
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default: // day
        startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    try {
      const visitorsByCountry = await Visitor.aggregate([
        {
          $match: {
            lastVisit: { $gte: startDate },
            'country.code': { $ne: 'Unknown' },
          },
        },
        {
          $group: {
            _id: {
              code: '$country.code',
              name: '$country.name',
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
      ]);

      res.json(visitorsByCountry);
    } catch (error) {
      console.error('Error fetching visitor countries:', error);
      res.status(500).json({ error: 'Failed to fetch visitor countries' });
    }
  }
}

module.exports = new AdminController();
