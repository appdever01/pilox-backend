const express = require('express');
const router = express.Router();
const PdfController = require('@controllers/PdfController');
const { authMiddleware } = require('@middleware/auth');
const { upload } = require('@helpers');

const pdfController = new PdfController();

router.use(authMiddleware);
router.post('/generate', pdfController.generate);
router.post('/generate-video', pdfController.generateVideo);
router.post('/generate-quiz', pdfController.generateQuiz);
router.post('/generate-flashcard', pdfController.generateFlashCard);
router.get('/video-progress', pdfController.getVideoProgress);
router.get('/video-status/:pdfId', pdfController.videoStatus);
router.post('/analyze', upload.single('pdf'), PdfController.analyzePdf);
router.get('/download-video/:videoId', pdfController.downloadVideo);
router.get('/preview-video/:videoId', pdfController.previewVideo);
router.get('/video-progress/:generationId', pdfController.getVideoProgress);
router.post('/more-videos', pdfController.getMoreVideos);
router.post('/generate-truefalse', pdfController.generateTrueFalse);
router.post('/generate-theory', pdfController.generateTheoryQuestions);
router.post('/verify-theory', pdfController.verifyTheoryAnswer);
router.get('/analysis-status/:analysisId', PdfController.getAnalysisStatus);

module.exports = router;
