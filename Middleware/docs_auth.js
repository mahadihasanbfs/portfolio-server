const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { user_collection } = require('../Collection/all_collection');
const { JWT_SECRET } = require('./admin_only');

// The API reference is only served to a signed-in employee. The check is server side: the docs HTML is never sent without it.
const COOKIE = 'docsToken';
const MAX_AGE = 12 * 60 * 60 * 1000;

const read_cookie = (req, name) => {
      const raw = req.header('cookie') || '';
      const hit = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
      return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
};

const is_https = (req) => req.secure || req.get('x-forwarded-proto') === 'https';

const signed_in = async (req) => {
      try {
            const token = read_cookie(req, COOKIE);
            if (!token) return false;
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.purpose !== 'docs') return false;
            const user = await user_collection.findOne({ _id: new ObjectId(decoded.userId) });
            return Boolean(user);
      } catch {
            return false;
      }
};

// Basic brute-force guard: 10 failed attempts per IP per 15 minutes (in memory, per instance).
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const too_many = (ip) => {
      const now = Date.now();
      const recent = (attempts.get(ip) || []).filter((t) => now - t < WINDOW);
      attempts.set(ip, recent);
      return recent.length >= 10;
};
const note_failure = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);

const page = async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const file = (await signed_in(req)) ? 'index.html' : 'docs_login.html';
      res.sendFile(path.join(__dirname, '..', file));
};

const login = async (req, res) => {
      const fail = (status, message) => res.status(status).send({ success: false, message });
      try {
            if (too_many(req.ip)) return fail(429, 'Too many attempts. Try again later.');

            const { email, password } = req.body || {};
            if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
                  return fail(400, 'Email and password are required');
            }

            const user = await user_collection.findOne({ email });
            const ok = user && (await bcrypt.compare(password, user.password));
            if (!ok) {
                  note_failure(req.ip);
                  return fail(401, 'Invalid email or password');
            }

            const token = jwt.sign({ userId: String(user._id), purpose: 'docs' }, JWT_SECRET, { expiresIn: '12h' });
            res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: is_https(req), maxAge: MAX_AGE, path: '/' });
            res.send({ success: true });
      } catch (error) {
            fail(500, 'Sign in failed');
      }
};

const logout = (req, res) => {
      res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', secure: is_https(req), path: '/' });
      res.send({ success: true });
};

module.exports = { page, login, logout };
