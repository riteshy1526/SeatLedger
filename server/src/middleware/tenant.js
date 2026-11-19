const tenantContext = (req, res, next) => {
  // If superadmin, allow overriding tenant via header or query param
  if (req.user && req.user.role === 'superadmin') {
    const overrideId = req.headers['x-library-id'] || req.query.libraryId;
    req.libraryId = overrideId || req.user.libraryId;
    return next();
  }

  if (!req.user || !req.user.libraryId) {
    return res.status(403).json({ success: false, message: 'No tenant / library association found for user' });
  }

  req.libraryId = req.user.libraryId.toString();
  next();
};

module.exports = { tenantContext };
