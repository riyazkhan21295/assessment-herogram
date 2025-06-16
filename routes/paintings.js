const express = require('express');
const { generatePaintings, getPaintings, retryPainting } = require('../controllers/paintingController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(authMiddleware);

router.post('/generate', generatePaintings);
router.get('/:titleId', getPaintings);
router.post('/:titleId/retry/:order', retryPainting);

module.exports = router; 