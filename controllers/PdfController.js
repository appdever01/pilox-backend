const fs = require('fs');
const pdfGenerator = require('@services/pdfGenerator');
const AIService = require('@services/AIService');
const YouTubeService = require('@services/YouTubeService');
const FileUploadService = require('@services/FileUploadService');
const apiKeys = require('../apikeys.json');
const VideoGenerator = require('@services/videoGenerator');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const progressTracker = require('../services/ProgressTracker');
const { ChatHistory, CreditHistory, User } = require('@models');
const mailer = require('@services/mailer');
const crypto = require('crypto');

const {
  generatePdfId,
  deductCredit,
  getSetting,
  response,
} = require('@helpers');

const pdfGeneratorService = new pdfGenerator();
const aiService = new AIService(apiKeys.geminiKeys);
const youtubeService = new YouTubeService();

class PdfController {
  async generate(req, res) {
    let DeductCredit = false;
    try {
      const {
        prompt,
        pages,
        includeImages = false,
        fontSize,
        fontStyle,
        alignment,
        introText,
        endingNotes,
      } = req.body;
      if (!prompt || !pages || pages < 1) {
        return response(res, 200, 'error', 'Invalid input parameters');
      }
      const userId = req.user._id;
      DeductCredit = await deductCredit(
        userId,
        getSetting('pdfGenerationCredit', 2),
        'Generated PDF',
        'pending'
      );
      if (DeductCredit == false) {
        return response(res, 200, 'error', 'Insufficient credits', {
          low_balance: true,
        });
      }
      const content = await pdfGeneratorService.generateContent(prompt, pages);
      const pdfPath = await pdfGeneratorService.createPDF(
        content,
        includeImages,
        {
          fontSize,
          fontStyle,
          alignment,
          introText,
          endingNotes,
        }
      );
      res.download(pdfPath, `${prompt.slice(0, 30)}.pdf`, (err) => {
        if (err) {
          console.error('Error sending file:', err);
          return response(res, 500, 'error', 'Error sending file');
        }
        fs.unlink(pdfPath, (unlinkErr) => {
          if (unlinkErr) console.error('Error deleting file:', unlinkErr);
        });
      });
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'completed' }
        );
      }
    } catch (error) {
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'failed' }
        );
      }
      console.error('Error in generateDocument:', error);
      return response(res, 500, 'error', 'Failed to generate document');
    }
  }

  async generateVideo(req, res) {
    const generationId = uuidv4();
    const userId = req.user._id;
    let DeductCredit = false;
    const { audiovoice, pdfId } = req.body;
    try {
      const { pdfUrl } = req.body;
      if (!pdfUrl) {
        return response(res, 200, 'error', 'No PDF file uploaded');
      }
      DeductCredit = await deductCredit(
        userId,
        getSetting('pdfVideoGenerationCredit', 3),
        'Generated PDF Video',
        'pending'
      );
      if (DeductCredit === false) {
        return response(res, 200, 'error', 'Insufficient credits', {
          low_balance: true,
        });
      }
      const response_data = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
      });
      const pdfBuffer = Buffer.from(response_data.data);

      const explanations = await aiService.analyzePdfWithGemini(
        pdfBuffer,
        true
      );

      const videoGenerator = new VideoGenerator(generationId);
      videoGenerator.pdfBuffer = pdfBuffer;
      videoGenerator.audiovoice = audiovoice || 'naheem';

      res.json({
        status: 'processing',
        message: 'Video generation started',
        data: {
          generationId,
        },
      });
      const finalVideoPath = await videoGenerator.processVideo(
        explanations,
        pdfId,
        DeductCredit
      );
      // Store the video path temporarily (you might want to use Redis for this in production)
      // Store video path for later download
      req.app.locals.videoDownloads = req.app.locals.videoDownloads || {};
      req.app.locals.videoDownloads[generationId] = {
        path: finalVideoPath,
        timestamp: Date.now(),
      };
      // Set cleanup timeout (e.g., 1 hour)
      setTimeout(
        async () => {
          try {
            if (req.app.locals.videoDownloads[generationId]) {
              await fs.promises.unlink(
                req.app.locals.videoDownloads[generationId].path
              );
              delete req.app.locals.videoDownloads[generationId];
            }
          } catch (error) {
            console.error('Cleanup error:', error);
          }
        },
        60 * 60 * 1000
      ); // 1 hour
      // Cleanup temporary files except final video
      await videoGenerator.cleanup(finalVideoPath);
    } catch (error) {
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'failed' }
        );
      }
      const chatHistory = await ChatHistory.findOne({ pdfId });
      const user = await User.findById(chatHistory.userId);
      const retryLink = `https://pilox.chat/chat/new`;
      mailer.sendVideoGenerationFailureEmail(user.email, user.name, retryLink);
      progressTracker.updateProgress(generationId, {
        status: 'error',
        error: error.message,
      });
    }
  }

  async getVideoProgress(req, res) {
    const { generationId } = req.params;
    const progress = progressTracker.getProgress(generationId);

    if (!progress) {
      return response(res, 200, 'error', 'Generation ID not found');
    }

    return response(res, 200, 'success', 'Progress fetched', {
      progress,
    });
  }

  async generateQuiz(req, res) {
    let DeductCredit = false;
    const userId = req.user._id;
    try {
      const {
        pdfUrl,
        numQuestions = 10,
        startPage = 1,
        endPage = null,
      } = req.body;
      const creditCost =
        numQuestions * getSetting('pdfQuizCreditPerQuestion', 0.01);

      DeductCredit = await deductCredit(
        userId,
        creditCost,
        'Generated PDF Quiz',
        'pending'
      );

      if (DeductCredit === false) {
        return response(res, 200, 'error', 'Insufficient credits', {
          low_balance: true,
        });
      }
      if (!pdfUrl) {
        return response(res, 200, 'error', 'No PDF file uploaded');
      }
      const response_data = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
      });
      const pdfBuffer = Buffer.from(response_data.data);
      const quiz = await aiService.generateQuiz(
        pdfBuffer,
        numQuestions,
        startPage,
        endPage
      );
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'completed' }
        );
      }
      return response(res, 200, 'success', 'Quiz generated', { quiz });
    } catch (error) {
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'failed' }
        );
      }
      console.error('Quiz generation error:', error);
      return response(res, 500, 'error', 'Failed to generate quiz');
    }
  }

  async generateFlashCard(req, res) {
    let DeductCredit = false;
    const userId = req.user._id;
    try {
      const {
        pdfUrl,
        numQuestions = 10,
        startPage = 1,
        endPage = null,
      } = req.body;
      const creditCost =
        numQuestions * getSetting('pdfFlashCardCreditPerQuestion', 0.01);

      DeductCredit = await deductCredit(
        userId,
        creditCost,
        'Generated PDF Flash Card',
        'pending'
      );

      if (DeductCredit === false) {
        return response(res, 200, 'error', 'Insufficient credits', {
          low_balance: true,
        });
      }
      if (!pdfUrl) {
        return response(res, 200, 'error', 'No PDF file uploaded');
      }
      const response_data = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
      });
      const pdfBuffer = Buffer.from(response_data.data);
      const flashcard = await aiService.generateFlashCard(
        pdfBuffer,
        numQuestions,
        startPage,
        endPage
      );

      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'completed' }
        );
      }
      return response(res, 200, 'success', 'Flash Card generated', {
        flashcard,
      });
    } catch (error) {
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'failed' }
        );
      }
      console.error('Flash card generation error:', error);
      return response(res, 500, 'error', 'Failed to generate flash card');
    }
  }

  async videoProgress(req, res) {
    try {
      const videoGenerator = req.app.locals.videoGenerator;
      if (!videoGenerator) {
        return response(
          res,
          200,
          'not_started',
          'Video generation not started',
          {
            progress: 0,
          }
        );
      }
      const progress = videoGenerator.getProgress();
      return response(
        res,
        200,
        progress.processingPages.length > 0 ? 'processing' : 'completed',
        'Progress fetched',
        {
          ...progress,
        }
      );
    } catch (error) {
      console.error('Error getting video progress:', error);
      return response(res, 500, 'error', 'Failed to get progress');
    }
  }

  async videoStatus(req, res) {
    try {
      const { pdfId } = req.params;

      const chatHistory = await ChatHistory.findOne(
        { pdfId },
        { videoUrl: 1, videoGenerationCompleted: 1, videoGenerationError: 1 }
      );

      if (!chatHistory) {
        return response(res, 200, 'error', 'No video generation record found');
      }

      return response(res, 200, 'success', 'Video status fetched', {
        isCompleted: chatHistory.videoGenerationCompleted || false,
        videoUrl: chatHistory.videoUrl || null,
        error: chatHistory.videoGenerationError || null,
      });
    } catch (error) {
      console.error('Error checking video status:', error);
      return response(res, 500, 'error', 'Failed to check video status');
    }
  }

  static async analyzePdf(req, res) {
    try {
      const { startPage = 1, endPage = null } = req.body;
      const userId = req.user._id;

      if (!req.file) {
        return response(res, 200, 'success', 'Analysis in progress', {
          phase: 'error',
          progress: 0,
          message: 'No PDF file uploaded',
          explanations: [],
        });
      }

      const analysisId = crypto.randomUUID();
      const originalFilename = req.file.originalname;

      PdfController.processPdfAnalysis(
        req.file.buffer,
        startPage,
        endPage,
        analysisId,
        userId,
        originalFilename
      ).catch((error) => {
        console.error('PDF analysis error:', error);
      });

      // Send initial response with analysisId
      return response(res, 200, 'success', 'Analysis started', {
        phase: 'uploading',
        progress: 10,
        message: 'Processing PDF file...',
        explanations: [],
        analysisId,
      });
    } catch (error) {
      return response(res, 200, 'success', 'Analysis status', {
        phase: 'error',
        progress: 0,
        message: error.message,
        explanations: [],
      });
    }
  }

  // Add a new method to store analysis state
  static analysisState = new Map();

  static async processPdfAnalysis(
    pdfBuffer,
    startPage,
    endPage,
    analysisId,
    userId,
    originalFilename
  ) {
    try {
      // Store initial state
      PdfController.analysisState.set(analysisId, {
        phase: 'uploading',
        progress: 10,
        message: 'Processing PDF file...',
        explanations: [],
        startTime: Date.now(),
      });

      const pdfjsLib = require('pdfjs-dist');
      const pdfDoc = await pdfjsLib.getDocument(pdfBuffer).promise;
      const totalPages = pdfDoc.numPages;
      const finalEndPage = endPage ? Math.min(endPage, totalPages) : totalPages;

      // Update state to analyzing
      PdfController.analysisState.set(analysisId, {
        phase: 'analyzing',
        progress: 30,
        message: `Analyzing PDF content from page ${startPage}${endPage ? ` to ${endPage}` : ''}...`,
        explanations: [],
        startTime: Date.now(),
      });

      const explanations = await aiService.analyzePdfWithGemini(
        pdfBuffer,
        false,
        parseInt(startPage),
        endPage ? parseInt(endPage) : null
      );

      // Generate pdfId using buffer data
      const pdfId = generatePdfId(pdfBuffer.toString('hex'));
      const fileUploadService = new FileUploadService();

      // Use original filename when uploading
      const pdfUrl = await fileUploadService.uploadFile(
        pdfBuffer,
        `${pdfId}_${originalFilename}`
      );

      // Extract keywords from explanations
      const keywords = explanations.reduce((acc, exp) => {
        const words = exp.content
          .split(/\s+/)
          .filter((word) => word.length > 4)
          .slice(0, 5);
        return [...acc, ...words];
      }, []);

      // Get unique keywords
      const uniqueKeywords = [...new Set(keywords)].slice(0, 10);

      // Search for related videos
      const videoResults = await youtubeService.searchVideos(
        uniqueKeywords,
        5,
        pdfId
      );
      const relatedVideos = videoResults.videos || [];

      // Save to chat history with original filename and videos
      await ChatHistory.create({
        userId,
        pdfId,
        filename: originalFilename,
        pdfUrl,
        explanations,
        messages: [],
        keywords: uniqueKeywords,
        relatedVideos,
      });

      // Update state with completed analysis
      PdfController.analysisState.set(analysisId, {
        phase: 'completed',
        progress: 100,
        message: 'Analysis completed',
        explanations,
        pdfId,
        startTime: Date.now(),
        keywords: uniqueKeywords,
        relatedVideos,
      });

      // Cleanup old analysis states after 5 minutes
      setTimeout(
        () => {
          PdfController.analysisState.delete(analysisId);
        },
        5 * 60 * 1000
      );

      return analysisId;
    } catch (error) {
      PdfController.analysisState.set(analysisId, {
        phase: 'error',
        progress: 0,
        message: error.message,
        explanations: [],
        startTime: Date.now(),
      });
      throw error;
    }
  }

  static async getAnalysisStatus(req, res) {
    const { analysisId } = req.params;

    const status = PdfController.analysisState.get(analysisId);

    if (!status) {
      return response(res, 404, 'error', 'Analysis not found');
    }

    // Cleanup old analyses (older than 5 minutes)
    if (Date.now() - status.startTime > 5 * 60 * 1000) {
      PdfController.analysisState.delete(analysisId);
      return response(res, 404, 'error', 'Analysis expired');
    }

    return response(res, 200, 'success', 'Analysis status retrieved', status);
  }

  async downloadVideo(req, res) {
    try {
      const { videoId } = req.params;
      const videoDownloads = req.app.locals.videoDownloads || {};
      const videoData = videoDownloads[videoId];

      if (!videoData) {
        return response(res, 200, 'error', 'Video not found');
      }

      // Set headers for download
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="pilox-video-${videoId}.mp4"`
      );

      // Stream the file
      const videoStream = fs.createReadStream(videoData.path);
      videoStream.pipe(res);

      // Cleanup after download
      videoStream.on('end', async () => {
        try {
          // Delete the video file
          await fs.promises.unlink(videoData.path);
          // Remove from temporary storage
          delete videoDownloads[videoId];
        } catch (error) {
          console.error('Cleanup error:', error);
        }
      });
    } catch (error) {
      console.error('Download error:', error);
      return response(res, 500, 'error', 'Download failed');
    }
  }

  async previewVideo(req, res) {
    try {
      const { videoId } = req.params;
      const videoDownloads = req.app.locals.videoDownloads || {};
      const videoData = videoDownloads[videoId];

      if (!videoData) {
        return response(res, 200, 'error', 'Video not found');
      }

      // Set headers for streaming
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');

      // Handle range requests for video seeking
      const stat = await fs.promises.stat(videoData.path);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(videoData.path, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoData.path).pipe(res);
      }
    } catch (error) {
      console.error('Preview error:', error);
      return response(res, 500, 'error', 'Preview failed');
    }
  }

  async getMoreVideos(req, res) {
    try {
      const { pdfId, page } = req.body;

      const chatHistory = await ChatHistory.findOne({ pdfId });
      const keywords = chatHistory.keywords;
      const result = await youtubeService.searchVideos(
        keywords,
        5,
        pdfId,
        page
      );

      if (result.status === 'limit_reached') {
        return response(res, 200, 'error', result.message);
      }
      chatHistory.relatedVideos = chatHistory.relatedVideos.concat(
        result.videos
      );
      await chatHistory.save();

      return response(res, 200, 'success', 'Videos fetched successfully', {
        videos: result.videos,
        canFetchMore: result.canFetchMore,
        remainingAttempts: youtubeService.getRemainingFetchAttempts(pdfId),
      });
    } catch (error) {
      console.error('Error fetching more videos:', error);
      return response(res, 500, 'error', 'Failed to fetch more videos');
    }
  }

  async generateTrueFalse(req, res) {
    let DeductCredit = false;
    const userId = req.user._id;
    try {
      const {
        pdfUrl,
        numQuestions = 10,
        startPage = 1,
        endPage = null,
      } = req.body;
      const creditCost =
        numQuestions * getSetting('pdfQuizCreditPerQuestion', 0.01);

      DeductCredit = await deductCredit(
        userId,
        creditCost,
        'Generated True/False Questions',
        'pending'
      );

      if (DeductCredit === false) {
        return response(res, 200, 'error', 'Insufficient credits', {
          low_balance: true,
        });
      }

      const response_data = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
      });
      const pdfBuffer = Buffer.from(response_data.data);

      const questions = await aiService.generateTrueFalse(
        pdfBuffer,
        numQuestions,
        startPage,
        endPage
      );

      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'completed' }
        );
      }

      return response(res, 200, 'success', 'True/False questions generated', {
        questions,
      });
    } catch (error) {
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'failed' }
        );
      }
      console.error('True/False generation error:', error);
      return response(res, 500, 'error', 'Failed to generate questions');
    }
  }

  async generateTheoryQuestions(req, res) {
    let DeductCredit = false;
    const userId = req.user._id;
    try {
      const {
        pdfUrl,
        numQuestions = 5,
        startPage = 1,
        endPage = null,
      } = req.body;

      DeductCredit = await deductCredit(
        userId,
        getSetting('pdfTheoryQuestionCredit', 1),
        'Generated Theory Questions',
        'pending'
      );

      if (DeductCredit === false) {
        return response(res, 200, 'error', 'Insufficient credits', {
          low_balance: true,
        });
      }

      const response_data = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
      });
      const pdfBuffer = Buffer.from(response_data.data);

      const questions = await aiService.generateTheoryQuestions(
        pdfBuffer,
        numQuestions,
        startPage,
        endPage
      );

      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'completed' }
        );
      }

      return response(res, 200, 'success', 'Theory questions generated', {
        questions,
      });
    } catch (error) {
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'failed' }
        );
      }
      console.error('Theory questions generation error:', error);
      return response(res, 500, 'error', 'Failed to generate questions');
    }
  }

  async verifyTheoryAnswer(req, res) {
    let DeductCredit = false;
    const userId = req.user._id;
    try {
      const { pdfUrl, question, userAnswer } = req.body;

      DeductCredit = await deductCredit(
        userId,
        getSetting('theoryAnswerVerificationCredit', 0.1),
        'Theory Answer Verification',
        'pending'
      );

      if (DeductCredit === false) {
        return response(res, 200, 'error', 'Insufficient credits', {
          low_balance: true,
        });
      }

      const response_data = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
      });
      const pdfBuffer = Buffer.from(response_data.data);

      const evaluation = await aiService.verifyTheoryAnswer(
        pdfBuffer,
        question,
        userAnswer
      );

      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'completed' }
        );
      }

      return response(res, 200, 'success', 'Answer verified', {
        evaluation,
      });
    } catch (error) {
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'failed' }
        );
      }
      console.error('Theory answer verification error:', error);
      return response(res, 500, 'error', 'Failed to verify answer');
    }
  }
}

module.exports = PdfController;
