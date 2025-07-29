const YouTubeSearchApi = require('youtube-search-api');
// const youtube = require('youtube-transcript-api');
const youtube = require('youtube-transcript');
const {
  geminiHelper,
  getSetting,
  checkUsedYoutubeVideoChat,
} = require('@helpers');
const {
  YoutubeTranscript,
  YoutubeChatHistory,
  CreditHistory,
} = require('@models');
const {
  deductCredit,
  getUserCreditBalance,
  getYouTubeVideoTitle,
} = require('@helpers');
const apikeys = require('../apikeys.json');

class YouTubeService {
  constructor() {
    this.geminiHelper = new geminiHelper();
    this.fetchAttempts = new Map(); // Track fetch attempts per user
  }

  async searchVideos(keywords, maxResults = 13, userId = null, page = 0) {
    try {
      // Track fetch attempts for this user
      if (userId) {
        const attempts = this.fetchAttempts.get(userId) || 0;
        if (attempts >= 2 && page > 0) {
          return {
            status: 'limit_reached',
            message: 'Maximum video fetch attempts reached',
            videos: [],
          };
        }
      }

      const searchQuery = `${keywords.join(' ')} tutorial explanation lesson`;

      const results = await YouTubeSearchApi.GetListByKeyword(
        searchQuery,
        false,
        maxResults,
        [
          {
            type: 'video',
            duration: 'medium',
          },
        ],
        page
      );

      if (!results.items || results.items.length === 0) {
        return {
          status: 'no_results',
          message: 'No videos found',
          videos: [],
        };
      }

      // Update fetch attempts for user
      if (userId && page > 0) {
        const attempts = this.fetchAttempts.get(userId) || 0;
        this.fetchAttempts.set(userId, attempts + 1);
      }

      console.log(results.items);
      const videos = results.items.map((item) => ({
        title: item.title,
        description: item.description,
        thumbnailUrl: item.thumbnail.thumbnails[0].url,
        videoId: item.id,
        url: `https://www.youtube.com/watch?v=${item.id}`,
      }));

      return {
        status: 'success',
        message: 'Videos fetched successfully',
        videos,
        canFetchMore: userId
          ? (this.fetchAttempts.get(userId) || 0) < 2
          : false,
      };
    } catch (error) {
      console.error('YouTube search error:', error);
      return {
        status: 'error',
        message: 'Failed to fetch videos',
        videos: [],
      };
    }
  }

  resetFetchAttempts(userId) {
    this.fetchAttempts.delete(userId);
  }

  getRemainingFetchAttempts(userId) {
    const attempts = this.fetchAttempts.get(userId) || 0;
    return Math.max(0, 2 - attempts);
  }

  async getTranscript(videoId) {
    try {
      let transcriptDoc = await YoutubeTranscript.findOne({ videoId });
      if (transcriptDoc && transcriptDoc.progress == 100) {
        console.log('Transcript already exists and is complete');
        return transcriptDoc.transcript;
      }
      if (!transcriptDoc) {
        console.log('Transcript does not exist, creating new one');
        await YoutubeTranscript.create({
          videoId,
          transcript: [],
          progress: 0,
        });
      }
      const transcript =
        await youtube.YoutubeTranscript.fetchTranscript(videoId);
      const totalSegments = transcript.length;
      const formattedTranscript = [];
      for (let i = 0; i < transcript.length; i++) {
        const segment = {
          text: transcript[i].text,
          startTime: transcript[i].offset,
          endTime: (transcript[i].offset + transcript[i].duration).toFixed(2),
        };
        formattedTranscript.push(segment);
        if (
          i % Math.ceil(totalSegments / 10) === 0 ||
          i === transcript.length - 1
        ) {
          const progress = Math.round(((i + 1) / totalSegments) * 100);
          await YoutubeTranscript.findOneAndUpdate(
            { videoId },
            {
              transcript: formattedTranscript,
              progress: progress,
            }
          );
        }
      }
      return formattedTranscript;
    } catch (error) {
      console.error('Error fetching transcript:', error);
      await YoutubeTranscript.findOneAndUpdate({ videoId }, { progress: -1 });
      throw new Error('Failed to fetch transcript');
    }
  }

  async getProgress(url) {
    try {
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        return { status: 'error', message: 'Invalid YouTube URL' };
      }
      const transcriptDoc = await YoutubeTranscript.findOne({ videoId });
      console.log('Transcript doc', transcriptDoc);
      if (!transcriptDoc) {
        return { status: 'not_found', message: 'Video not found' };
      }
      if (transcriptDoc.progress === -1) {
        return { status: 'error', message: 'Failed to get progress' };
      }
      if (transcriptDoc.progress === 100) {
        return { status: 'completed', message: 'Video analysis completed' };
      }
      return {
        status: 'in_progress',
        message: 'Video analysis in progress',
        data: {
          progress: transcriptDoc.progress || 0,
        },
      };
    } catch (error) {
      console.error('Error getting progress:', error);
      return { status: 'error', message: 'Failed to get progress' };
    }
  }

  async askQuestion(userId, url, question, chatId = null) {
    let DeductCredit = false;
    try {
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        return {
          status: 'error',
          message: 'Invalid YouTube URL',
        };
      }
      const transcriptDoc = await YoutubeTranscript.findOne({ videoId });
      if (!transcriptDoc || transcriptDoc.progress !== 100) {
        this.getTranscript(videoId);
        return {
          status: 'analyzing',
          message:
            'Video is being analyzed. Please try again in a few moments.',
          data: {
            first_time: true,
          },
        };
      }
      if (!transcriptDoc.transcript) {
        return {
          status: 'processing',
          message:
            'Video transcript is still being analyzed. Please try again in a few moments.',
          data: {
            first_time: true,
          },
        };
      }
      let existingHistory = await YoutubeChatHistory.findOne(
        chatId
          ? {
              user: userId,
              video_id: videoId,
              _id: chatId,
            }
          : {
              user: userId,
              video_id: videoId,
            }
      );
      if (existingHistory) {
        if (
          existingHistory.messages.filter((msg) => msg.role === 'user')
            .length >= existingHistory.limit
        ) {
          return {
            status: 'limit_reached',
            message: 'You have reached the questions limit for this video',
          };
        }
        if (!existingHistory.title) {
          existingHistory.title = await getYouTubeVideoTitle(videoId);
          await existingHistory.save();
        }
        existingHistory.messages.push({
          role: 'user',
          question: question,
        });
        await existingHistory.save();
      } else {
        DeductCredit = await deductCredit(
          userId,
          getSetting('chatWithYouTubeCredit', 3),
          'Analyzed YouTube Video',
          'pending'
        );
        if (DeductCredit === false) {
          return {
            status: 'error',
            message: 'Insufficient credits',
            data: {
              low_balance: true,
            },
          };
        }
        existingHistory = await YoutubeChatHistory.create({
          user: userId,
          video_id: videoId,
          title: await getYouTubeVideoTitle(videoId),
          limit: getSetting('chatWithYouTubeLimit', 30),
        });
      }
      const transcriptText = transcriptDoc.transcript
        .map((entry) => {
          const timestamp = this.formatTimestamp(Math.floor(entry.startTime));
          return `[${timestamp}] ${entry.text}`;
        })
        .join('\n');

      const context = `
        You are an AI assistant analyzing YouTube video content and explain deeply and in detail the video content for proper understanding. 
        Give sections relating to the question only and explain very well and in detail.
        If the question is not related to the video, give sections of key concept of the video
         Video content:
        ${transcriptText}
    
        Question: ${question}

        Return ONLY a JSON object without any markdown formatting or code block syntax.
                
        Important: Your response should strictly follow this structure exactly:
        {
            "videoMetadata": {
                "title": string,
                "sections": [
                    {
                      "title": string,
                      "timestamp": string, // should only be the starting timestamp of the section
                      "durationMinutes": number
                    }
                ],
                "keyPoints": string[]
            },
            "answer": {
                "content": string,
                "evidence": [
                    {
                        "quote": string,
                        "timestamp": string,
                        "context": string
                    }
                ],
                "technicalConcepts": [
                    {
                        "term": string,
                        "explanation": string
                    }
                ]
            }
        }
        Important: Don't return too much timestamps, only the ones that are relevant to the question (like 2-4 timestamps)
        Important: Strictly Return only the JSON object, with no additional text or formatting.
      `;

      let attempts = 0;
      const maxAttempts = this.geminiHelper.getApiKeysLength();
      while (attempts < maxAttempts) {
        try {
          const genAI = this.geminiHelper.generativeAI(
            this.geminiHelper.getNextApiKey()
          );
          const model = this.geminiHelper.getModel(
            genAI,
            'gemini-2.0-flash-001'
          );
          const result = await model.generateContent(context);
          const response = result.response.text();
          let jsonResponse;
          try {
            const cleanedText = response
              .replace(/```json/g, '')
              .replace(/```/g, '')
              .trim();
            jsonResponse = JSON.parse(cleanedText);
          } catch (error) {
            console.log('Error parsing Gemini response as JSON', error);
            throw new Error('Failed to parse Gemini response as JSON');
          }
          const aiResponse = {
            metadata: {
              title: jsonResponse.videoMetadata.title,
              sections: jsonResponse.videoMetadata.sections.map((section) => ({
                title: section.title,
                timestamp: section.timestamp,
                duration: section.durationMinutes,
              })),
              keyPoints: jsonResponse.videoMetadata.keyPoints,
            },
            analysis: {
              summary: jsonResponse.answer.content,
              evidence: jsonResponse.answer.evidence.map((ev) => ({
                quote: ev.quote,
                timestamp: ev.timestamp,
                context: ev.context,
              })),
              concepts: jsonResponse.answer.technicalConcepts.map(
                (concept) => ({
                  term: concept.term,
                  explanation: concept.explanation,
                })
              ),
            },
          };
          existingHistory.messages.push({
            role: 'model',
            data: aiResponse,
          });
          await existingHistory.save();
          if (DeductCredit !== false) {
            await CreditHistory.findOneAndUpdate(
              { reference: DeductCredit },
              { status: 'completed' }
            );
          }
          const usage = await checkUsedYoutubeVideoChat(existingHistory._id);
          const chatHistory = await YoutubeChatHistory.find({ user: userId })
            .select('_id video_id title createdAt')
            .sort({ lastUpdated: -1 });
          return {
            status: 'success',
            message: 'Question answered successfully',
            data: {
              first_time: false,
              limit: existingHistory.limit,
              usage: usage,
              data: aiResponse,
              chat_history: chatHistory,
              chat_id: existingHistory._id,
            },
          };
        } catch (error) {
          console.error(`Attempt ${attempts + 1} failed:`, error);
          attempts++;
          if (attempts === maxAttempts)
            throw new Error('All API keys exhausted');
        }
      }
    } catch (error) {
      if (DeductCredit !== false) {
        await CreditHistory.findOneAndUpdate(
          { reference: DeductCredit },
          { status: 'failed' }
        );
      }
      console.error('Error when trying to chat with video:', error);
      return {
        status: 'error',
        message: 'Failed to process chat request',
      };
    }
  }

  async deleteChatHistory(chatId) {
    const chatHistory = await YoutubeChatHistory.findById(chatId);
    if (!chatHistory) {
      return {
        status: 'error',
        message: 'Chat history not found',
      };
    }
    await YoutubeChatHistory.findByIdAndDelete(chatId);
    const allChatHistory = await YoutubeChatHistory.find({
      user: chatHistory.user,
    })
      .select('_id video_id title createdAt')
      .sort({ lastUpdated: -1 });
    return {
      status: 'success',
      message: 'Chat history deleted successfully',
      data: {
        chat_history: allChatHistory,
      },
    };
  }

  async processVideoAnalysis(response) {
    try {
      const cleanedText = response
        .text()
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      return this.parseVideoAnalysis(cleanedText);
    } catch (error) {
      console.error('Error processing video analysis:', error);
      throw new Error('Failed to process video analysis');
    }
  }

  async parseVideoAnalysis(text) {
    text = text.trim();
    try {
      const jsonResponse = JSON.parse(text);
      if (jsonResponse.videoMetadata && jsonResponse.answer) {
        return {
          metadata: {
            title: jsonResponse.videoMetadata.title,
            sections: jsonResponse.videoMetadata.sections.map((section) => ({
              title: section.title,
              timestamp: section.timestamp,
              duration: section.durationMinutes,
            })),
            keyPoints: jsonResponse.videoMetadata.keyPoints,
          },
          analysis: {
            summary: jsonResponse.answer.content,
            evidence: jsonResponse.answer.evidence.map((ev) => ({
              quote: ev.quote,
              timestamp: ev.timestamp,
              context: ev.context,
            })),
            concepts: jsonResponse.answer.technicalConcepts.map((concept) => ({
              term: concept.term,
              explanation: concept.explanation,
            })),
          },
        };
      }
      return this.handleUnexpectedFormat(jsonResponse);
    } catch (parseError) {
      console.log('Error parsing video analysis response:', parseError);
      return this.handleParseError(text);
    }
  }

  async increaseChatLimit(chatId, amount) {
    try {
      const chatHistory = await YoutubeChatHistory.findById(chatId);
      if (!chatHistory) {
        return {
          status: 'error',
          message: 'Chat history not found',
        };
      }
      const credits = getSetting('upgradeYouTubeChatLimitPerCredit', 10);
      const DeductCredit = await deductCredit(
        chatHistory.user,
        amount,
        `Added ${amount} credits to YouTube Chat Limit`,
        'completed'
      );
      if (DeductCredit === false) {
        return {
          status: 'error',
          message: 'Insufficient credits',
          data: {
            low_balance: true,
          },
        };
      }
      const newLimit = chatHistory.limit + amount * credits;
      await YoutubeChatHistory.findByIdAndUpdate(chatId, { limit: newLimit });
      const usage = await checkUsedYoutubeVideoChat(chatHistory._id);
      const creditBalance = await getUserCreditBalance(chatHistory.user);
      return {
        status: 'success',
        message: 'YouTube chat limit increased successfully',
        data: {
          limit: newLimit,
          usage: usage,
          new_credit_balance: creditBalance,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Failed to increase chat limit',
      };
    }
  }

  handleUnexpectedFormat(data) {
    return {
      metadata: {
        title: data.title || 'Video Analysis',
        sections: [],
        keyPoints: [],
      },
      analysis: {
        summary: data.content || JSON.stringify(data),
        evidence: [],
        concepts: [],
      },
    };
  }

  handleParseError(text) {
    return {
      metadata: {
        title: 'Video Analysis',
        sections: [],
        keyPoints: [],
      },
      analysis: {
        summary: text,
        evidence: [],
        concepts: [],
      },
    };
  }

  formatTranscript(transcript) {
    return transcript.map((entry) => ({
      text: entry.text,
      startTime: entry.start,
      endTime: entry.start + entry.duration,
    }));
  }

  formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  extractVideoId(url) {
    const regex =
      /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }
}

module.exports = YouTubeService;
