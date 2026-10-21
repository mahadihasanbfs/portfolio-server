const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { user_collection } = require('../Collection/all_collection');

const JWT_SECRET = 'your_jwt_secret_key';

// Same rule the dashboard uses to show admin menus (layout/Dashboard.jsx).
const ADMIN_DESIGNATIONS = ['Chief Executive Officer', 'manager'];

const fail = (res, status, message) =>
      res.status(status).send({ success: false, message, request_time: new Date().getTime() });

// Verifies the JWT issued by /auth/sign-in and loads the user into req.user.
const authenticate = async (req, res, next) => {
      try {
            const header = req.header('Authorization') || '';
            const token = header.startsWith('Bearer ') ? header.slice(7) : null;
            if (!token) return fail(res, 401, 'Sign in required');

            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await user_collection.findOne({ _id: new ObjectId(decoded.userId) });
            if (!user) return fail(res, 401, 'User not found');

            const { password, ...safe } = user;
            req.user = safe;
            next();
      } catch (error) {
            return fail(res, 401, 'Invalid or expired token');
      }
};

const admin_only = (req, res, next) =>
      authenticate(req, res, () => {
            if (!ADMIN_DESIGNATIONS.includes(req.user.designation)) {
                  return fail(res, 403, 'Admin access required');
            }
            next();
      });

module.exports = { authenticate, admin_only, ADMIN_DESIGNATIONS, JWT_SECRET };
