require('dotenv').config();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ADMIN_KEY = process.env.ADMIN_KEY;

const adminMiddleware = async (req, res, next) => {
  const token = req.body.token || 
                req.headers.authorization?.split(' ')[1] || 
                req.query.token;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Requires admin role' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ status: 'error', error: 'Unauthorized' });
  }
};

module.exports = { adminMiddleware };
