const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

class FileUploadService {
  constructor() {
    this.API_URL = 'https://api.campux.io';
    this.API_KEY =
      'f8e052d9c5f7a6b3e1d4c8b2a9f0e7d6c3b5a8f4e2d1c7b9a6f3e0d5c8b2a9';
    this.SECRET_KEY = '9f3a2b1c8d7e6f4a5b2c9d0e8f7a6b3d';

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  generateSignature(method, path) {
    const timestamp = Date.now();
    const signaturePath = path.replace('/api/v1/files', '');
    const data = `${timestamp}${this.API_KEY}${method}${signaturePath}`;
    const signature = crypto
      .createHmac('sha256', this.SECRET_KEY)
      .update(data)
      .digest('hex');

    return {
      timestamp,
      signature,
      headers: {
        'x-timestamp': timestamp,
        'x-signature': signature,
        'x-api-key': this.API_KEY,
      },
    };
  }

  async uploadFile(fileBuffer, fileName) {
    let tempPathT = null;
    try {
      // Create tmp directory in project root if it doesn't exist
      const tmpDir = path.join(__dirname, '../tmp');
      await fs.promises.mkdir(tmpDir, { recursive: true });

      // Use the created tmp directory for the temporary file
      const tempPath = path.join(tmpDir, `${Date.now()}_${fileName}`);
      tempPathT = tempPath;
      await fs.promises.writeFile(tempPath, fileBuffer);

      const filePath = tempPath;
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));

      const auth = this.generateSignature('POST', '/api/v1/files/upload');

      const response = await axios.post(process.env.UPLOAD_URL, formData, {
        headers: {
          ...auth.headers,
          ...formData.getHeaders(),
        },
      });

      // Clean up the temporary file
      await fs.promises.unlink(tempPath);

      console.log('File uploaded successfully:', response.data);
      return response.data.url; // Return the file URL
    } catch (error) {
      console.error('Upload Error:', error.response?.data || error.message);
      await fs.promises.unlink(tempPathT);
      throw error;
    }
  }

  async uploadFile_(fileBuffer, fileName) {
    try {
      const tmpDir = path.join(__dirname, '../tmp');
      await fs.promises.mkdir(tmpDir, { recursive: true });

      const tempPath = path.join(tmpDir, `${Date.now()}_${fileName}`);
      await fs.promises.writeFile(tempPath, fileBuffer);

      const result = await cloudinary.uploader.upload(tempPath, {
        folder: 'pdf_uploads',
        resource_type: 'raw',
        public_id: `pdf_${Date.now()}`,
        overwrite: true,
      });

      // Clean up the temporary file
      await fs.promises.unlink(tempPath);

      console.log('Cloudinary upload successful:', result.secure_url);
      return result.secure_url;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw error;
    }
  }
}

module.exports = FileUploadService;
