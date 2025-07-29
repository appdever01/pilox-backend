const express = require('express');
const router = express.Router();
const AnalyticsController = require('@controllers/AnalyticsController');

router.post('/query', AnalyticsController.query);
router.get('/metrics/:sessionId', AnalyticsController.metrics);
router.post('/track-visit', express.json(), AnalyticsController.trackVisit);

module.exports = router;
