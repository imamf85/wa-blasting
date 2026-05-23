/**
 * Role-Based Access Control middleware
 * Restrict routes based on user roles
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // User should be attached by authenticate middleware
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Check if user is admin
 */
export function requireAdmin(req, res, next) {
  return requireRole('admin')(req, res, next);
}

/**
 * Check if user is admin or operator
 */
export function requireOperator(req, res, next) {
  return requireRole('admin', 'operator')(req, res, next);
}

export default {
  requireRole,
  requireAdmin,
  requireOperator
};
