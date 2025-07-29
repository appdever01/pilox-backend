const { getCountryFromIP, response } = require('@helpers');
const { Analytics, User, Visitor, ChatHistory } = require('@models');
const AIService = require('@services/AIService');
const apiKeys = require('../apikeys.json');
// const chatHistories = new Map();
const geminiApiKeys = apiKeys.geminiKeys;
const aiService = new AIService(geminiApiKeys);

class AnalyticsController {
  // async query(req, res) {
  //   try {
  //     const { query } = req.body;
  //     const sessionId = req.sessionId;

  //     // Initialize or get existing chat history
  //     let history = chatHistories.get(sessionId) || { messages: [] };
  //     history.messages.push({ role: 'user', parts: [{ text: query }] });

  //     // Create analytics entry for the query attempt
  //     await Analytics.create({
  //       sessionId,
  //       activityType: 'pdf_analysis',
  //       details: 'User initiated a PDF query',
  //       metadata: {
  //         userAgent: req.headers['user-agent'],
  //         ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
  //       },
  //     });
  //     // Update user metrics
  //     // await User.findOneAndUpdate(
  //     //   { sessionId },
  //     //   {
  //     //     $inc: { queryCount: 1 },
  //     //     $set: { lastActive: new Date() },
  //     //   },
  //     //   { upsert: true }
  //     // );

  //     let attempts = 0;
  //     const maxAttempts = geminiApiKeys.length;

  //     while (attempts < maxAttempts) {
  //       try {
  //         const apiKey = aiService.getNextApiKey();
  //         console.log(`Query - Attempt ${attempts + 1} using key:`, apiKey);

  //         const response = await aiService.processQuery(query, apiKey, history);

  //         // Update chat history
  //         history.messages.push({ role: 'model', parts: [{ text: response }] });
  //         if (history.messages.length > 10) {
  //           history.messages = history.messages.slice(-10);
  //         }
  //         chatHistories.set(sessionId, history);

  //         return res.json({ response });
  //       } catch (error) {
  //         console.error(`Attempt ${attempts + 1} failed:`, error);
  //         attempts++;

  //         if (attempts === maxAttempts) {
  //           throw new Error('All API keys exhausted');
  //         }
  //       }
  //     }
  //   } catch (error) {
  //     console.error('Query error:', error);

  //     // Log the error in analytics
  //     try {
  //       await Analytics.create({
  //         sessionId: req.headers['x-session-id'],
  //         activityType: 'error',
  //         details: `Query error: ${error.message}`,
  //         metadata: {
  //           errorCode: 'QUERY_FAILED',
  //           userAgent: req.headers['user-agent'],
  //           ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
  //         },
  //       });
  //     } catch (analyticsError) {
  //       console.error('Failed to log error analytics:', analyticsError);
  //     }

  //     res.status(500).json({ error: 'Failed to process query' });
  //   }
  // }

  async query(req, res) {
    try {
      const { query, pdfId } = req.body;

      if (!pdfId) {
        return response(res, 400, 'error', 'PDF ID is required');
      }

      // Find chat history and get PDF context
      let chatHistory = await ChatHistory.findOne({ pdfId });
      if (!chatHistory) {
        return response(res, 400, 'error', 'Chat history not found');
      }

      // Get PDF context from explanations
      const pdfContext = chatHistory.explanations
        .map((exp) => `Page ${exp.page}: ${exp.content}`)
        .join('\n\n');

      // Add user message
      chatHistory.messages.push({
        role: 'user',
        parts: [{ text: query }],
      });

      let attempts = 0;
      const maxAttempts = geminiApiKeys.length;

      while (attempts < maxAttempts) {
        try {
          const apiKey = aiService.getNextApiKey();

          const cleanMessages = chatHistory.messages.map((msg) => ({
            role: msg.role,
            parts: msg.parts.map((part) => ({ text: part.text })),
          }));

          const data = await aiService.processQuery(
            query,
            apiKey,
            { messages: cleanMessages },
            pdfContext
          );

          // Add AI response to chat history
          chatHistory.messages.push({
            role: 'model',
            parts: [{ text: data }],
          });

          await chatHistory.save();

          return response(res, 200, 'success', 'Query processed successfully', {
            data,
          });
        } catch (error) {
          console.error(`Attempt ${attempts + 1} failed:`, error);
          attempts++;
          if (attempts === maxAttempts) {
            throw new Error('All API keys exhausted');
          }
        }
      }
    } catch (error) {
      console.error('Query error:', error);
      return response(res, 500, 'error', 'Failed to process query');
    }
  }

  async metrics(req, res) {
    try {
      const { sessionId } = req.params;
      const user = await User.findOne({ sessionId });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({
        queryCount: user.queryCount,
        pdfAnalysisCount: user.pdfAnalysisCount,
        lastActive: user.lastActive,
      });
    } catch (error) {
      console.error('Metrics error:', error);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  }

  async trackVisit(req, res) {
    try {
      const ip =
        req.body.ip ||
        req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const country = await getCountryFromIP(ip);

      const cleanIp = ip.includes('::ffff:') ? ip.split('::ffff:')[1] : ip;

      await Visitor.findOneAndUpdate(
        { ip: cleanIp },
        {
          $set: {
            userAgent,
            country,
            lastVisit: new Date(),
          },
          $inc: { visitCount: 1 },
        },
        { upsert: true, new: true }
      );

      // Track this visit in Analytics
      await Analytics.create({
        activityType: 'visit',
        timestamp: new Date(),
        sessionId: req.body.sessionId,
        details: `Visit from ${country.name}`,
        metadata: {
          ip: cleanIp,
          country: country.code,
          userAgent: userAgent,
        },
      });

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error tracking visit:', error);
      res.status(500).json({ error: 'Failed to track visit' });
    }
  }
}

module.exports = new AnalyticsController();
