// Google Calendar link for appointments: creates a Google Meet link for each online booking and keeps
// the Calendar event in sync when it is rescheduled or cancelled.
//
// One company Google account is connected once from the dashboard (Appointments > Google Calendar).
// Needs the Calendar API enabled in the same Google Cloud project as the Gmail panel and this redirect URI
// added to the OAuth client: <server>/api/v1/appointment/google/callback
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const { appointment_settings_collection } = require("../Collection/all_collection");
const { JWT_SECRET } = require("../Middleware/admin_only");
const h = require("./gmail_helpers");

require("dotenv").config();
const IS_PROD = process.env.NODE_ENV === "production";
const CFG = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      encKey: process.env.GMAIL_ENC_KEY,
      redirectUri: "http://localhost:5010/api/v1/appointment/google/callback",
            
      frontend: "https://www.brightfuturesoft.com",
};
const SCOPES = [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.send", // booking emails go out from the connected account
];
const KEY = "google_calendar";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const configured = () => Boolean(CFG.clientId && CFG.clientSecret && CFG.encKey);
const ok = (res, data) => res.send({ success: true, request_time: Date.now(), data });
const fail = (res, status, message) => res.status(status).send({ success: false, message, request_time: Date.now() });

const token_request = async (params) => {
      const r = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: CFG.clientId, client_secret: CFG.clientSecret, ...params }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(json.error_description || json.error || "Google token error"), { google: json.error });
      return json;
};

/* ---------- connect / status / disconnect (admin dashboard) ---------- */

const status = async (req, res, next) => {
      try {
            const row = await appointment_settings_collection.findOne({ key: KEY });
            ok(res, { configured: configured(), connected: Boolean(row), email: row?.email || null, canSend: Boolean(row?.canSend), redirectUri: CFG.redirectUri });
      } catch (e) { next(e); }
};

const auth_url = (req, res) => {
      if (!configured()) return fail(res, 503, "Google is not configured on the server (client ID, secret or encryption key missing).");
      const state = jwt.sign({ purpose: "gcal" }, JWT_SECRET, { expiresIn: "10m" });
      const params = new URLSearchParams({
            client_id: CFG.clientId,
            redirect_uri: CFG.redirectUri,
            response_type: "code",
            scope: SCOPES.join(" "),
            access_type: "offline",
            prompt: "select_account consent",
            state,
      });
      ok(res, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
};

const back = (res, result) =>
      res.redirect(`${CFG.frontend}/dashboard/client_meetings?${new URLSearchParams(result)}`);

// Browser lands here from Google: no Authorization header, identity comes from the signed `state`.
const callback = async (req, res) => {
      try {
            const { code, state, error } = req.query;
            const claims = jwt.verify(state, JWT_SECRET);
            if (claims.purpose !== "gcal") throw new Error("bad state");
            if (error) return back(res, { gcal: "error", reason: error });

            const tokens = await token_request({ code, grant_type: "authorization_code", redirect_uri: CFG.redirectUri });
            const granted = String(tokens.scope || "").split(" ");
            if (!granted.includes(SCOPES[0])) return back(res, { gcal: "error", reason: "permissions_missing" });
            if (!tokens.refresh_token) return back(res, { gcal: "error", reason: "no_refresh_token" });

            const info = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json();
            await appointment_settings_collection.updateOne(
                  { key: KEY },
                  { $set: {
                        key: KEY,
                        email: info.email || null,
                        canSend: granted.includes(SCOPES[2]),
                        refreshToken: h.encrypt(tokens.refresh_token, CFG.encKey),
                        accessToken: tokens.access_token,
                        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
                        connectedAt: new Date().toISOString(),
                  } },
                  { upsert: true }
            );
            back(res, { gcal: "connected" });
      } catch (err) {
            console.error("Appointment Google callback failed:", err.name, err.message, err.google || "");
            // Name the failing step so the dashboard can say what to fix.
            const reason = err.google
                  || (err.name === "TokenExpiredError" ? "state_expired"
                        : err.name === "JsonWebTokenError" ? "state_invalid"
                              : /encrypt|key|cipher|iv/i.test(err.message || "") ? "encryption_key"
                                    : /mongo|topology|timed out/i.test(`${err.name} ${err.message}`) ? "database"
                                          : "failed");
            back(res, { gcal: "error", reason, detail: String(err.message || "").slice(0, 120) });
      }
};

const disconnect = async (req, res, next) => {
      try {
            const row = await appointment_settings_collection.findOne({ key: KEY });
            if (row) {
                  try {
                        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(h.decrypt(row.refreshToken, CFG.encKey))}`, { method: "POST" });
                  } catch (e) { /* best effort */ }
                  await appointment_settings_collection.deleteOne({ _id: row._id });
            }
            ok(res, null);
      } catch (e) { next(e); }
};

/* ---------- Calendar calls (used by the booking flow) ---------- */

const access_token = async () => {
      const row = await appointment_settings_collection.findOne({ key: KEY });
      if (!row || !configured()) return null;
      if (row.expiresAt > Date.now() + 60000) return row.accessToken;
      try {
            const t = await token_request({ grant_type: "refresh_token", refresh_token: h.decrypt(row.refreshToken, CFG.encKey) });
            await appointment_settings_collection.updateOne({ _id: row._id }, { $set: { accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 } });
            return t.access_token;
      } catch (e) {
            if (e.google === "invalid_grant") await appointment_settings_collection.deleteOne({ _id: row._id }); // access revoked: reconnect needed
            throw e;
      }
};

const api = async (url, { method = "GET", body } = {}) => {
      const token = await access_token();
      if (!token) return null; // not connected
      const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (r.status === 204) return {};
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error?.message || `Google Calendar error ${r.status}`);
      return json;
};

// Creates the Calendar event with a Meet link. Returns { eventId, meetLink } or null when Google is not connected.
const create_meet = async ({ id, title, description, start, end, attendee }) => {
      const json = await api(`${CAL}?conferenceDataVersion=1&sendUpdates=none`, {
            method: "POST",
            body: {
                  summary: title,
                  description,
                  start: { dateTime: start.toISOString() },
                  end: { dateTime: end.toISOString() },
                  attendees: attendee ? [{ email: attendee.email, displayName: attendee.name }] : [],
                  conferenceData: { createRequest: { requestId: `bfs-${id}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
                  reminders: { useDefault: true },
            },
      });
      if (!json) return null;
      return { eventId: json.id, meetLink: json.hangoutLink || json.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri || null };
};

const move_event = (eventId, start, end) =>
      api(`${CAL}/${encodeURIComponent(eventId)}?sendUpdates=none`, {
            method: "PATCH",
            body: { start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } },
      });

const delete_event = (eventId) => api(`${CAL}/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: "DELETE" });

// Sends a nodemailer-style message (to, subject, html, attachments) through the connected Gmail account.
// Returns false when no account is connected / allowed to send, so the caller can fall back to SMTP.
const send_mail = async (opts) => {
      const row = await appointment_settings_collection.findOne({ key: KEY });
      if (!row || !row.canSend || !row.email) return false;
      const raw = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" })
            .sendMail({ from: `"Bright Future Soft" <${row.email}>`, ...opts });
      const json = await api("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            body: { raw: raw.message.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") },
      });
      return Boolean(json && json.id);
};

module.exports = { send_mail, status, auth_url, callback, disconnect, create_meet, move_event, delete_event };
