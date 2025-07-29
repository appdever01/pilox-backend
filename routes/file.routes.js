const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const axios = require('axios');
const {
  deleteFromCloudflare,
  uploadToCloudflare,
} = require('../utils/cloudflare');

const upload = multer();
const verifySignature = (req, res, next) => {
  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];
  const apiKey = req.headers['x-api-key'];

  if (!timestamp || !signature || !apiKey) {
    return res.status(401).json({ error: 'Missing authentication headers' });
  }

  const timestampDate = new Date(parseInt(timestamp));
  const now = new Date();
  if (Math.abs(now - timestampDate) > 5 * 60 * 1000) {
    return res.status(401).json({ error: 'Request expired' });
  }

  const secretKey = process.env.API_SECRET_KEY;
  const data = `${timestamp}${apiKey}${req.method}${req.path}`;
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(data)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
};

router.post(
  '/upload',
  verifySignature,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      console.log('Received file:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      const result = await uploadToCloudflare(req.file);
      console.log('Upload result:', result);
      res.json(result);
    } catch (error) {
      console.error('Upload error:', error);

      res.status(500).json({
        error: 'Upload failed',
        details: error.message,
      });
    }
  }
);

router.delete('/:filename', verifySignature, async (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message: 'Filename is required',
      });
    }

    const result = await deleteFromCloudflare(filename);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'File deleted successfully',
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'File not found or could not be deleted',
      });
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: error.message,
    });
  }
});

module.exports = router;
