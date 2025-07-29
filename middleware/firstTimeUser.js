const { verifyToken } = require('@middleware/auth');

const firstTimeUserMiddleware = async (req, res, next) => {
  // Check if user has already analyzed a PDF
  console.log('the');
  const hasAnalyzed = req.cookies.hasAnalyzed;
  console.log(hasAnalyzed);
  const isAuthRoute = req.path === '/login' || req.path === '/signup';
  const token = req.cookies.token;
  const user = await verifyToken(token);
  req.user = user;

  if (hasAnalyzed && !user && !isAuthRoute) {
    return res.redirect('/login');
  }

  next();
};

module.exports = firstTimeUserMiddleware;
