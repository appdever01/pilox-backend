const jwt = require('jsonwebtoken');
const { User } = require('@models');
const { generateReferralCode } = require('@helpers');

const authMiddleware = async (req, res, next) => {
  const allowedRoutes = [
    '/api/auth/resend-verification-email',
    '/api/auth/verify-email',
    '/resend-verification-email',
    '/verify-email'
  ];

  try {
    // Extract token from various sources
    let token = null;
    
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    // Check body
    if (!token && req.body && req.body.token) {
      token = req.body.token;
    }
    
    // Check query params
    if (!token && req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      console.error('Auth failed: No token provided');
      console.debug('Headers:', req.headers);
      console.debug('Body:', req.body);
      console.debug('Query:', req.query);
      return res.status(401).json({ 
        status: 'error', 
        error: 'Authentication required. Please provide a valid token.' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ 
        status: 'error', 
        error: 'Invalid token format' 
      });
    }

    // Get user
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ 
        status: 'error', 
        error: 'User not found' 
      });
    }

    // Set user in request
    req.user = user;

    // Generate referral code if not exists
    if (!user.referralCode) {
      const referralCode = await generateReferralCode();
      await User.findByIdAndUpdate(user._id, { referralCode });
      req.user.referralCode = referralCode;
    }

    // Check verification status
    if (!user.isVerified && !allowedRoutes.includes(req.path)) {
      return res.status(401).json({ 
        status: 'error', 
        error: 'Email verification required',
        requiresVerification: true
      });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        error: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        error: 'Token expired'
      });
    }

    res.clearCookie('token');
    return res.status(401).json({
      status: 'error',
      error: 'Authentication failed'
    });
  }
};

const verifyToken = async (token) => {
  try {
    if (!token) {
      return false;
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user details
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) {
        return false;
      }

      return user;
    } catch (error) {
      console.error('Auth middleware error:', error);
      return false;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return false;
  }
};

module.exports = { authMiddleware, verifyToken };
