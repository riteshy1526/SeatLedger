const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'seatledger-super-secret-key-2026';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token missing or invalid format' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role, libraryId, name, studentProfileId }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token', error: err.message });
  }
};

module.exports = { authenticate, JWT_SECRET };
