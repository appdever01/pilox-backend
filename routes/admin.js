const express = require('express');
const router = express.Router();
const AdminController = require('@controllers/AdminController');
const v2AuthController = require('@controllers/authControllerV2');
const { adminMiddleware } = require('@middleware/admin');

router.post('/admin/validate', adminMiddleware, AdminController.validate);
router.post('/admin/metrics', adminMiddleware, AdminController.metrics);
router.post('/admin/visitors', adminMiddleware, AdminController.visitors);
router.post('/admin/chart-data', adminMiddleware, AdminController.chartData);
router.post(
  '/admin/detailed-analytics',
  adminMiddleware,
  AdminController.detailedAnalytics
);
router.post(
  '/admin/visitor-countries',
  adminMiddleware,
  AdminController.visitorCountries
);
router.post('/admin', AdminController.getAdminPage);
router.post(
  '/admin/send-newsletter',
  adminMiddleware,
  v2AuthController.sendNewsLetter
);

module.exports = router;
