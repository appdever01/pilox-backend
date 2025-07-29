const { GoogleAIFileManager } = require('@google/generative-ai/server');
const fs = require('fs');
const path = require('path');
const os = require('os');

class GeminiFileManager {
  constructor(apiKey) {
    this.fileManager = new GoogleAIFileManager(apiKey);
  }

  async uploadFile(buffer) {
    try {        
        const tempDir = './temp_pdf';
        
        // Create temp directory if it doesn't exist
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const displayName = `pdf_analysis_${timestamp}.pdf`;
        const pdfPath = path.join(tempDir, displayName); // Removed duplicate .pdf extension
        
        const binaryPdf = Buffer.from(buffer);
        fs.writeFileSync(pdfPath, binaryPdf, 'binary');
        
        const result = await this.fileManager.uploadFile(pdfPath, {
          mimeType: 'application/pdf',
          displayName: displayName,
        });

        // Clean up temporary file
        fs.unlinkSync(pdfPath);
      
      return result;
    } catch (error) {
      console.error('File upload error:', error);
      throw error;
    }
  }
}

module.exports = GeminiFileManager; 