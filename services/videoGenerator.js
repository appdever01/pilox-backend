const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const FormData = require('form-data');
const fs = require('fs');
const pdfjsLib = require('pdfjs-dist');
const path = require('path');
const axios = require('axios');
const progressTracker = require('./ProgressTracker');
const FileUploadService = require('./FileUploadService');
const { ChatHistory, CreditHistory, User } = require('@models');
const mailer = require('@services/mailer');

require('dotenv').config();

// Configure PDF.js for Node.js environment
pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve(
  require.resolve('pdfjs-dist/build/pdf.worker.js')
);

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

class VideoGenerator {
  constructor(generationId) {
    this.generationId = generationId;
    this.outputDir = path.join(__dirname, '../temp', generationId);
    this.totalPages = 0;
    this.audiovoice = 'naheem';
    this.debug = true;
    this.progress = {
      status: 'initializing',
      totalSteps: 0,
      completedSteps: 0,
      currentStep: '',
      details: {
        framesGenerated: 0,
        audioGenerated: 0,
        videosGenerated: 0,
        combining: false,
        error: null,
      },
      percentage: 0,
    };
  }

  updateProgress(update) {
    this.progress = { ...this.progress, ...update };
    this.progress.percentage = Math.min(
      Math.round(
        (this.progress.completedSteps / this.progress.totalSteps) * 100
      ),
      100
    );
    progressTracker.updateProgress(this.generationId, this.progress);
  }

  cleanHtmlContent(htmlContent) {
    let cleanText = htmlContent.replace(/<[^>]*>/g, '');
    cleanText = cleanText
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    return cleanText;
  }

  async generateAudio(text, audioPath) {
    try {
      // Clean the HTML content before sending to TTS
      const cleanedText = this.cleanHtmlContent(text);
      const response = await axios({
        method: 'post',
        url: 'https://services.pilox.com.ng/v1/audio/speech',
        headers: {
          Authorization: 'Bearer a9X3l7Zq2YB5c8W1D6v4K0NmAeTgJpRfLQdVxMwCsHk',
          'Content-Type': 'application/json',
        },
        data: {
          input: cleanedText,
          voice: this.audiovoice,
        },
        responseType: 'arraybuffer',
      });

      await new Promise((resolve, reject) => {
        fs.writeFile(audioPath, response.data, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return audioPath;
    } catch (error) {
      console.error('Audio generation error:', error);
      throw new Error('Failed to generate audio narration');
    }
  }

  async generatePageVideo(explanation, pageNumber) {
    try {
      const timestamp = Date.now();
      const audioPath = path.join(
        this.outputDir,
        `audio_${pageNumber}_${timestamp}.mp3`
      );
      const imagePath = path.join(
        this.outputDir,
        `frame_${pageNumber}_${timestamp}.png`
      );
      const videoPath = path.join(
        this.outputDir,
        `page_${pageNumber}_${timestamp}.mp4`
      );

      await new Promise((resolve, reject) => {
        fs.mkdir(this.outputDir, { recursive: true }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Update progress for frame generation start
      this.updateProgress({
        currentStep: `Generating frame`,
      });

      // Generate frame and audio in parallel
      await Promise.all([
        this.createVideoFrame(explanation.content, pageNumber, imagePath).then(
          () => {
            this.progress.details.framesGenerated++;
            this.progress.completedSteps++;
            this.updateProgress({});
          }
        ),
        this.generateAudio(explanation.content, audioPath).then(() => {
          this.progress.details.audioGenerated++;
          this.progress.completedSteps++;
          this.updateProgress({});
        }),
      ]);

      // Update progress for video creation
      this.updateProgress({
        currentStep: `Creating video`,
      });

      await this.createVideo(imagePath, audioPath, videoPath, pageNumber);
      this.progress.details.videosGenerated++;
      this.progress.completedSteps++;
      this.updateProgress({});

      return videoPath;
    } catch (error) {
      this.updateProgress({
        status: 'error',
        error: `Error in page ${pageNumber}: ${error.message}`,
      });
      throw error;
    }
  }

  async processVideo(explanations, pdfId, DeductCredit) {
    try {
      this.totalPages = explanations.length;
      this.progress.totalSteps = this.totalPages * 3 + 1;

      this.updateProgress({
        status: 'processing',
        currentStep: 'Starting video generation',
      });

      const videoPaths = await Promise.all(
        explanations.map(async (explanation) => {
          return await this.generatePageVideo(explanation, explanation.page);
        })
      );

      this.updateProgress({
        currentStep: 'Combining videos',
        details: { ...this.progress.details, combining: true },
      });

      const finalVideoPath = await this.combineVideos(videoPaths);

      this.updateProgress({
        status: 'completed',
        currentStep: 'Video generation completed',
        completedSteps: this.progress.totalSteps,
        percentage: 100,
      });

      // Start upload process in background
      this.handleVideoUpload(finalVideoPath, pdfId, DeductCredit).catch(
        async (error) => {
          console.error('Background video upload failed:', error);
          throw error;
        }
      );

      // Return early without waiting for upload
      return finalVideoPath;
    } catch (error) {
      this.updateProgress({
        status: 'error',
        error: error.message,
      });
      throw error;
    }
  }

  // New method to handle background upload
  async handleVideoUpload(finalVideoPath, pdfId, DeductCredit) {
    try {
      const fileUploadService = new FileUploadService();
      const videoBuffer = await fs.promises.readFile(finalVideoPath);
      const videoUrl = await fileUploadService.uploadFile(
        videoBuffer,
        `video_${pdfId}_${Date.now()}.mp4`
      );

      // Update chat history with video URL
      const chatHistory = await ChatHistory.findOneAndUpdate(
        { pdfId },
        {
          videoUrl: videoUrl,
          videoGenerationCompleted: true,
          videoGenerationError: null,
        },
        { new: true }
      );
      console.log(chatHistory);
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'completed' }
        );
      }

      // send email to user
      const user = await User.findById(chatHistory.userId);
      mailer.sendVideoGenerationEmail(user.email, user.name, videoUrl);
    } catch (error) {
      console.error('Failed to upload video in background:', error);
      throw error;
    }
  }

  async normalizeAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .audioFilters([
          'apad', // Add padding
          'loudnorm=I=-16', // Normalize audio levels
          'aresample=44100', // Consistent sample rate
        ])
        .outputOptions(['-c:a aac', '-b:a 192k'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  async createVideoFrame(pageContent, pageNumber, imagePath) {
    try {
      // Create form data for the API request
      const formData = new FormData();

      // Create a Buffer from the PDF data and convert it to a Readable stream
      const fileStream = require('stream').Readable.from(this.pdfBuffer);

      // Append the file stream with proper filename and content type
      const timestamp = Date.now();
      formData.append('file', fileStream, {
        filename: `document_${pageNumber}_${timestamp}.pdf`,
        contentType: 'application/pdf',
      });

      // Add other parameters
      formData.append('page', String(pageNumber));
      formData.append('dpi', '300');

      const response = await axios.post(
        'https://services.pilox.com.ng/convert-pdf',
        formData,
        {
          responseType: 'arraybuffer',
          headers: {
            ...formData.getHeaders(),
          },
        }
      );
      console.log(response.data);

      await new Promise((resolve, reject) => {
        fs.writeFile(imagePath, response.data, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return imagePath;
    } catch (error) {
      if (error.response && error.response.data) {
        const errorMessage = Buffer.from(error.response.data).toString();
        console.error('API Error Response:', errorMessage);
      }
      console.error('Error creating video frame:', error);
      throw new Error('Failed to create video frame from PDF page');
    }
  }

  async createVideo(imagePath, audioPath, outputPath, pageNumber) {
    return new Promise((resolve, reject) => {
      // First verify files exist and are not empty
      if (!fs.existsSync(imagePath) || fs.statSync(imagePath).size === 0) {
        reject(new Error(`Invalid image file for page ${pageNumber}`));
        return;
      }
      if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
        reject(new Error(`Invalid audio file for page ${pageNumber}`));
        return;
      }

      ffmpeg()
        .input(imagePath)
        .inputOptions(['-loop 1'])
        .input(audioPath)
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast', // Faster encoding
          '-crf 23', // Better quality-size balance
          '-tune stillimage',
          '-c:a aac',
          '-b:a 128k',
          '-pix_fmt yuv420p',
          '-shortest',
          '-r 24',
          // '-vf scale=1280:720',  // Fixed 720p resolution
          '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-movflags +faststart',
        ])
        .on('start', (commandLine) => {
          console.log(`Starting FFmpeg for page ${pageNumber}:`, commandLine);
        })
        .on('progress', (progress) => {
          console.log(`FFmpeg progress for page ${pageNumber}:`, progress);
        })
        .on('error', (err, stdout, stderr) => {
          console.error(`FFmpeg error for page ${pageNumber}:`, err.message);
          console.error('FFmpeg stdout:', stdout);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .on('end', () => {
          // Verify the output file exists and is not empty
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            console.log(`Successfully created video for page ${pageNumber}`);
            resolve(outputPath);
          } else {
            reject(
              new Error(`Failed to create valid video for page ${pageNumber}`)
            );
          }
        })
        .save(outputPath);
    });
  }

  async combineVideos(videoPaths) {
    // Process videos in chunks to avoid memory overload
    const chunkSize = 4; // Process 4 videos at a time
    const chunks = [];

    for (let i = 0; i < videoPaths.length; i += chunkSize) {
      chunks.push(videoPaths.slice(i, i + chunkSize));
    }

    const intermediateFiles = [];

    // Process each chunk in parallel
    for (const chunk of chunks) {
      const timestamp_3 = Date.now();
      const chunkPath = path.join(
        this.outputDir,
        `chunk_${chunks.indexOf(chunk)}_${timestamp_3}.mp4`
      );

      // Create concat file for this chunk
      const timestamp_4 = Date.now();
      const chunkListPath = path.join(
        this.outputDir,
        `chunk_${chunks.indexOf(chunk)}_${timestamp_4}.txt`
      );
      const chunkContent = chunk
        .map((p) => `file '${path.resolve(p)}'`)
        .join('\n');
      // Write chunk list file using Promise-based fs
      await new Promise((resolve, reject) => {
        fs.writeFile(chunkListPath, chunkContent, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Process chunk
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(chunkListPath)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions(['-c:v copy', '-c:a copy', '-movflags +faststart'])
          .output(chunkPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      intermediateFiles.push(chunkPath);
    }

    // Combine all chunks into final video
    const timestamp_5 = Date.now();
    const finalListPath = path.join(
      this.outputDir,
      `final_list_${timestamp_5}.txt`
    );
    const finalContent = intermediateFiles
      .map((p) => `file '${path.resolve(p)}'`)
      .join('\n');

    // Write final list file using Promise-based fs
    await new Promise((resolve, reject) => {
      fs.writeFile(finalListPath, finalContent, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const outputPath = path.join(this.outputDir, `final_${timestamp_5}.mp4`);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(finalListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy', '-movflags +faststart'])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err))
        .run();
    });
  }

  // async createVideoSegments(pageContent, pageNumber) {
  //   try {
  //     // Create initial high-res image
  //     const tempPdfPath = path.join(this.outputDir, `temp_${pageNumber}.pdf`);
  //     await fs.writeFile(tempPdfPath, this.pdfBuffer);

  //     // Generate high-res image with higher DPI for better quality
  //     const options = {
  //       format: 'png',
  //       out_dir: this.outputDir,
  //       out_prefix: `frame_${pageNumber}`,
  //       page: pageNumber,
  //       dpi: 300,
  //       scale: 2.0, // Increase scale for better quality
  //     };

  //     // await pdfPoppler.convert(tempPdfPath, options);
  //     const fullImagePath = path.join(
  //       this.outputDir,
  //       `frame_${pageNumber}-${pageNumber}.png`
  //     );

  //     // Get image dimensions
  //     const metadata = await sharp(fullImagePath).metadata();
  //     const { width, height } = metadata;

  //     // Calculate dimensions for zoomed segments
  //     const targetHeight = 1080;
  //     const zoomFactor = 0.5; // Show 50% of the page height at a time
  //     const segmentHeight = Math.floor(targetHeight * zoomFactor);
  //     const numSegments = Math.ceil(height / segmentHeight);
  //     const overlap = 100; // Pixels of overlap between segments for smoother transitions
  //     const segments = [];

  //     // Create segments with overlap
  //     for (let i = 0; i < numSegments; i++) {
  //       const segmentPath = path.join(
  //         this.outputDir,
  //         `frame_${pageNumber}_segment_${i}.png`
  //       );
  //       const startY = Math.max(0, i * segmentHeight - overlap);
  //       const segmentHeightWithOverlap = Math.min(
  //         segmentHeight + 2 * overlap,
  //         height - startY
  //       );

  //       await sharp(fullImagePath)
  //         .extract({
  //           left: 0,
  //           top: startY,
  //           width: width,
  //           height: segmentHeightWithOverlap,
  //         })
  //         .resize(1920, 1080, {
  //           fit: 'contain',
  //           background: 'white',
  //         })
  //         .sharpen()
  //         .toFile(segmentPath);

  //       segments.push(segmentPath);
  //     }

  //     await fs.unlink(tempPdfPath);
  //     await fs.unlink(fullImagePath);

  //     return segments;
  //   } catch (error) {
  //     console.error('Error creating video segments:', error);
  //     throw error;
  //   }
  // }

  async createScrollingVideo(segments, audioPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) return reject(err);

        const audioDuration = metadata.format.duration;
        // Allocate time for each segment, reserving some time for transitions
        const segmentDuration =
          (audioDuration - (segments.length - 1)) / segments.length;
        const transitionDuration = 1; // 1 second transition

        let filterComplex = segments
          .map((_, i) => {
            return `[${i + 1}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v${i}]`;
          })
          .join(';');

        // Create crossfade transitions
        if (segments.length > 1) {
          segments.reduce((acc, _, i) => {
            if (i === 0) return;
            if (i === 1) {
              filterComplex += `;[v0][v1]xfade=duration=${transitionDuration}:offset=${segmentDuration}[f0]`;
              return 'f0';
            }
            filterComplex += `;[${acc}][v${i}]xfade=duration=${transitionDuration}:offset=${i * segmentDuration}[f${i}]`;
            return `f${i}`;
          }, '');
        }

        const command = ffmpeg()
          .input(audioPath)
          .audioFilters(['apad', 'loudnorm=I=-16:LRA=11:TP=-1.5']);

        // Add segment inputs with adjusted durations
        segments.forEach((segment) => {
          command
            .input(segment)
            .inputOptions([
              '-loop',
              '1',
              '-t',
              (segmentDuration + transitionDuration).toString(),
            ]);
        });

        if (segments.length === 1) {
          command.complexFilter(filterComplex, ['v0']);
        } else {
          command.complexFilter(filterComplex, [`f${segments.length - 1}`]);
        }

        command
          .outputOptions([
            '-c:v libx264',
            '-c:a aac',
            '-b:a 192k',
            '-ar 44100',
            '-shortest',
          ])
          .output(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', (err) => reject(err))
          .run();
      });
    });
  }

  async cleanup(excludeFile = null) {
    try {
      // Use Promise-based readdir
      const files = await new Promise((resolve, reject) => {
        fs.readdir(this.outputDir, (err, files) => {
          if (err) reject(err);
          else resolve(files);
        });
      });

      // Filter out the final video file if specified
      const filesToDelete = excludeFile
        ? files.filter(
            (file) => path.join(this.outputDir, file) !== excludeFile
          )
        : files;

      // Delete each file except the final video
      await Promise.all(
        filesToDelete.map(
          (file) =>
            new Promise((resolve, reject) => {
              fs.unlink(path.join(this.outputDir, file), (err) => {
                if (err) reject(err);
                else resolve();
              });
            })
        )
      );

      // Only remove the directory if we're not excluding any files
      if (!excludeFile) {
        await new Promise((resolve, reject) => {
          fs.rmdir(this.outputDir, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  getProgress() {
    if (this.totalAudioDuration === 0) return 0;
    const progressPercentage =
      (this.currentProgress / this.totalAudioDuration) * 100;
    return {
      progress: Math.min(Math.round(progressPercentage), 100),
      totalDuration: this.totalAudioDuration,
      currentProgress: this.currentProgress,
      processingPages: Array.from(this.processingPages),
    };
  }

  async getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          console.error('Error probing audio file:', err);
          return reject(err);
        }
        resolve(metadata);
      });
    });
  }
}

module.exports = VideoGenerator;
