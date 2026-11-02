const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { user_collection } = require('../Collection/all_collection');

const { ADMIN_DESIGNATIONS, effective, can } = require('./access');

const JWT_SECRET = 'your_jwt_secret_key';

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
            if (user.active === false) return fail(res, 401, 'This account has been deactivated');

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

// Signed-in user who may open this dashboard page: full admins, or a role/custom list that includes the page.
const page_only = (key) => (req, res, next) =>
      authenticate(req, res, async () => {
            try {
                  const access = await effective(req.user);
                  if (!can(access.permissions, key)) return fail(res, 403, 'You do not have access to this page');
                  req.access = access;
                  next();
            } catch (error) {
                  next(error);
            }
      });

module.exports = { authenticate, admin_only, page_only, ADMIN_DESIGNATIONS, JWT_SECRET };
