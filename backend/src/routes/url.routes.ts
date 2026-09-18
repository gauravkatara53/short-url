import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as urlController from '../controllers/url.controller.js';

const router = Router();

// Route-level debug logger for /api/urls
router.use((req, _res, next) => {
  console.log(`[URL_ROUTER] 🚦 Matched URL route: ${req.method} /api/urls${req.url}`);
  next();
});

// All URL management routes require authentication
router.post('/', authenticate, urlController.createUrl);
router.get('/', authenticate, urlController.getUserUrls);
router.delete('/:id', authenticate, urlController.deleteUrl);

export default router;
