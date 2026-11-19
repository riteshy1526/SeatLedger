const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ success: false, message: 'Unauthenticated' });
    }

    if (req.user.role === 'superadmin') {
      return next(); // Superadmin has access to all actions
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: role '${req.user.role}' is not authorized to access this resource. Required: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

module.exports = { requireRoles };
