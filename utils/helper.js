const multer = require('multer');
const userSessions = new Map();
const { v4: uuidv4 } = require('uuid');
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require('@google/generative-ai');
const apiKeys = require('../apikeys.json');
const currencies = require('../currency.json').currencies;
const countries = require('../countries.json').countries;
const {
  Currency,
  Country,
  CreditHistory,
  User,
  YoutubeChatHistory,
} = require('@models');
const crypto = require('crypto');
const fs = require('fs');
const settingsData = require('../settingsData.json');

const response = (res, status_code, status, message, data = {}) => {
  const responseBody = {
    status: status,
    message: message,
    data: data,
  };

  if (status >= 400) {
    responseBody.error = message;
  }

  return res.status(status_code).json(responseBody);
};

const getSetting = (key, defaultValue) => {
  return settingsData[key] ?? defaultValue;
};

const setSetting = (key, value) => {
  settingsData[key] = value;
  fs.writeFileSync('settingsData.json', JSON.stringify(settingsData, null, 2));
};

const getCountryFromIP = async (ip) => {
  try {
    // Try ipinfo.io first
    const response = await fetch(
      `https://ipinfo.io/${ip}/json?token=YOUR_IPINFO_TOKEN`
    );
    const data = await response.json();
    if (data.country && data.country_name) {
      return {
        code: data.country,
        name: data.country_name,
      };
    }

    const fallbackResponse = await fetch(`https://ipwhois.app/json/${ip}`);
    const fallbackData = await fallbackResponse.json();

    if (
      fallbackData.success &&
      fallbackData.country_code &&
      fallbackData.country
    ) {
      return {
        code: fallbackData.country_code,
        name: fallbackData.country,
      };
    }

    const abstractResponse = await fetch(
      `https://ipgeolocation.abstractapi.com/v1/?api_key=YOUR_ABSTRACT_API_KEY&ip_address=${ip}`
    );
    const abstractData = await abstractResponse.json();

    if (abstractData.country_code && abstractData.country) {
      return {
        code: abstractData.country_code,
        name: abstractData.country,
      };
    }
  } catch (error) {
    console.error('Error getting country info:', error);
  }

  return {
    code: 'USD',
    name: 'United States',
  };
};

const deductCredit = async (userId, amount, description, status) => {
  const balance = await getUserCreditBalance(userId);
  if (balance < amount) {
    return false;
  }
  await User.findByIdAndUpdate(userId, { $inc: { credits: -amount } });
  const creditHistoryReference = await generateCreditHistoryReference();
  const his = await CreditHistory.create({
    user: userId,
    credits: amount,
    description: description,
    type: 'debit',
    status: status,
    reference: creditHistoryReference,
  });
  return his.reference;
};

const getYouTubeVideoTitle = async (videoId) => {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`
    );
    const data = await response.json();
    return data.title;
  } catch (error) {
    console.error('Error getting YouTube video title:', error);
    return 'Unknown';
  }
};

const checkUsedYoutubeVideoChat = async (id) => {
  const his = await YoutubeChatHistory.findOne({ _id: id });
  return his.messages.filter((msg) => msg.role === 'user').length;
};

const migrateCurrencyFromCountry = async () => {
  console.log('Migrating currency from country');
  try {
    for (const currencyData of currencies) {
      let currency = await Currency.findOne({ code: currencyData.code });
      if (!currency) {
        await Currency.create({
          name: currencyData.name,
          code: currencyData.code,
          symbol: currencyData.symbol,
          rate: currencyData.rate,
        });
      }
    }
  } catch (error) {
    console.error('Error migrating currency:', error);
  }
  console.log('Currency migrated');
};

const generateReferralCode = async () => {
  let referralCode;
  let exists = true;
  while (exists) {
    referralCode = crypto
      .randomBytes(4)
      .toString('hex')
      .substring(0, 6)
      .toUpperCase();
    exists = await User.findOne({ referralCode });
  }
  return referralCode;
};

const migrateCountries = async () => {
  console.log('Migrating countries');
  try {
    for (const countryData of countries) {
      let country = await Country.findOne({ code: countryData.code });
      if (!country) {
        await Country.create({
          name: countryData.name,
          code: countryData.code,
          currency: countryData.currency,
        });
      }
    }
  } catch (error) {
    console.error('Error migrating countries:', error);
  }
  console.log('Countries migrated');
};

const getCreditRate = async (userId, amount, currencyCode) => {
  const creditRate =
    currencyCode === 'NGN'
      ? process.env.NIGERIA_CREDIT_RATE
      : process.env.DEFAULT_CREDIT_RATE;
  if (!creditRate) {
    throw new Error('Credit rate not configured');
  }
  const credits = amount / creditRate;
  return credits;
};

const generateCreditHistoryReference = async () => {
  let reference;
  let exists = true;
  while (exists) {
    reference = crypto
      .randomBytes(4)
      .toString('hex')
      .substring(0, 7)
      .toUpperCase();
    exists = await CreditHistory.findOne({ reference });
  }
  return reference;
};

const sessionHandler = (req, res, next) => {
  const sessionId = req.headers['x-session-id'];

  if (!sessionId) {
    return res.status(400).json({
      error: 'SESSION_REQUIRED',
      message: 'Session ID is required',
    });
  }

  if (!userSessions.has(sessionId)) {
    userSessions.set(sessionId, {
      createdAt: Date.now(),
      queryCount: 0,
    });
  }

  req.sessionId = sessionId;
  next();
};

const getMimeType = (format) => {
  const mimeTypes = {
    // Documents
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    rtf: 'application/rtf',
    txt: 'text/plain',
    odt: 'application/vnd.oasis.opendocument.text',

    // Spreadsheets
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    csv: 'text/csv',

    // Presentations
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    odp: 'application/vnd.oasis.opendocument.presentation',

    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    webp: 'image/webp',

    // Others
    epub: 'application/epub+zip',
    mobi: 'application/x-mobipocket-ebook',
    html: 'text/html',
  };

  return mimeTypes[format] || 'application/octet-stream';
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  },
});

const getUserCreditBalance = async (userId) => {
  try {
    const creditTransactions = await CreditHistory.find({
      user: userId,
      status: { $in: ['completed', 'pending'] },
    });
    const balance = creditTransactions.reduce((total, transaction) => {
      if (transaction.type === 'credit') {
        return total + (Number(transaction.credits) || 0);
      } else if (transaction.type === 'debit') {
        return total - (Number(transaction.credits) || 0);
      }
      return total;
    }, 0);
    return balance;
  } catch (error) {
    console.error('Error calculating user credit balance:', error);
    throw error;
  }
};

class geminiHelper {
  constructor() {
    this.apiKeys = apiKeys.geminiKeys;
    this.currentKeyIndex = 0;
  }

  getApiKeysLength() {
    return this.apiKeys.length;
  }

  getNextApiKey() {
    const key = this.apiKeys[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return key;
  }

  getModel(genAI, modelName) {
    return genAI.getGenerativeModel({
      model: modelName,
      safety_settings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });
  }

  generativeAI(apiKey) {
    return new GoogleGenerativeAI(apiKey);
  }
}

const getUuid = () => {
  return uuidv4();
};

function generatePdfId(pdfBuffer) {
  const hash = crypto
    .createHash('sha256')
    .update(pdfBuffer)
    .digest('hex')
    .substring(0, 12);
  return `pdf_${hash}_${Date.now()}`;
}

module.exports = {
  getCountryFromIP,
  sessionHandler,
  getMimeType,
  upload,
  getUuid,
  geminiHelper,
  migrateCurrencyFromCountry,
  migrateCountries,
  getCreditRate,
  generateCreditHistoryReference,
  generatePdfId,
  generateReferralCode,
  deductCredit,
  getSetting,
  setSetting,
  getUserCreditBalance,
  checkUsedYoutubeVideoChat,
  getYouTubeVideoTitle,
  response,
};
