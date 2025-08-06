require('module-alias/register');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { User, Visitor, Analytics, ChatHistory } = require('@models');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

const corsOptions = {
  origin: [
    'https://pilox.com.ng',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.set('trust proxy', true);

const routes = require('@routes/routes');
app.use('/', routes);

// Database connection
const mongooseOptions = {
  serverSelectionTimeoutMS: 60000,
  socketTimeoutMS: 45000,
  bufferCommands: true,
  retryWrites: true,
  retryReads: true,
  connectTimeoutMS: 60000,
};

// // Set the view engine and views directory
// app.set('view engine', 'ejs'); // Specify EJS as the template engine
// app.set('views', path.join(__dirname, 'views')); // Set the views directory

async function startService() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`Server running on port http://localhost:${PORT}`)
  );
}

async function start() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
    console.log('MongoDB connected successfully');
    // Add retry logic for index creation
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await Promise.all([
          Analytics.createIndexes(),
          Visitor.createIndexes(),
          User.createIndexes(),
          ChatHistory.createIndexes(),
          startService(),
        ]);
        console.log('Database indexes created successfully');
        break;
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        console.log(`Retry ${i + 1} for index creation...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found on this server',
  });
});

start();
