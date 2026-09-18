import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as analyticsController from '../controllers/analytics.controller.js';

const router = Router();

// Route-level debug logger for /api/analytics
router.use((req, _res, next) => {
  console.log(`[ANALYTICS_ROUTER] 📊 Matched analytics route: ${req.method} /api/analytics${req.url}`);
  next();
});

// All analytics endpoints require JWT authentication
router.use(authenticate);

router.get('/:shortCode/overview', analyticsController.getOverview);
router.get('/:shortCode/timeline', analyticsController.getTimeline);
router.get('/:shortCode/devices', analyticsController.getDevices);
router.get('/:shortCode/browsers', analyticsController.getBrowsers);
router.get('/:shortCode/os', analyticsController.getOperatingSystems);
router.get('/:shortCode/referrers', analyticsController.getReferrers);
router.get('/:shortCode/countries', analyticsController.getCountries);

export default router;
