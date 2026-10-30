const fetch = require("node-fetch");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { gmail_accounts_collection, mail_sent_collection, mail_settings_collection } = require("../Collection/all_collection");
const { JWT_SECRET } = require("../Middleware/admin_only");
const h = require("./gmail_helpers");

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPES = [
      "https://www.googleapis.com/auth/gmail.modify", // read, labels, star, trash
      "https://www.googleapis.com/auth/gmail.send",
];

// Secrets come from .env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_ENC_KEY); never hardcode them.
require("dotenv").config();
const IS_PROD = process.env.NODE_ENV === "production";
const CONFIG = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: IS_PROD
            ? "https://sever.brightfuturesoft.com/api/v1/mail/gmail/callback"
            : "http://localhost:5010/api/v1/mail/gmail/callback",
      frontend: IS_PROD ? "https://brightfuturesoft.com" : "http://localhost:5173",
      // Encrypts stored Gmail refresh tokens. Changing it disconnects every linked Gmail.
      // Outgoing mail goes through Resend SMTP (the Gmail account is only used to READ company mail).
      // Same server for everyone; each employee saves their own Resend API key (the SMTP password) in the panel.
      smtp: { host: "smtp.resend.com", port: 465, secure: true, user: "resend" },
      // Only mail addressed to this domain is shown in the panel.
      companyDomain: "brightfuturesoft.com",
      // Used as the sender when an employee's own login email is not on the company domain.
      fallbackFrom: "no-reply@brightfuturesoft.com",
      encKey: process.env.GMAIL_ENC_KEY,
};

const env = () => CONFIG;

const configured = () =>
      Boolean(CONFIG.clientId && CONFIG.clientSecret) &&
      !CONFIG.clientId.startsWith("PASTE_") &&
      !CONFIG.clientSecret.startsWith("PASTE_");

const transport_for = (apiKey) => nodemailer.createTransport({
      host: CONFIG.smtp.host,
      port: CONFIG.smtp.port,
      secure: CONFIG.smtp.secure,
      auth: { user: CONFIG.smtp.user, pass: apiKey },
});

// Each employee's own Resend key, stored encrypted. Returns null when they have not set one.
const user_resend_key = async (userId) => {
      const row = await mail_settings_collection.findOne({ userId: String(userId) });
      return row?.resendKey ? h.decrypt(row.resendKey, CONFIG.encKey) : null;
};

// Panel filter: inbox, starred, trash... only ever contain mail sent to a company address.
const company_filter = () => {
      const d = CONFIG.companyDomain;
      return `(to:${d} OR cc:${d} OR bcc:${d} OR deliveredto:${d})`;
};

// The address an employee sends from: their own company email, else the shared fallback.
const send_from = (user) => {
      const own = String(user.email || "").toLowerCase();
      return own.endsWith(`@${CONFIG.companyDomain}`) ? own : CONFIG.fallbackFrom;
};

const http_error = (status, message) => Object.assign(new Error(message), { status });

const ok = (res, data) => res.send({ success: true, request_time: new Date().getTime(), data });

/* ---------- OAuth ---------- */

const status = async (req, res, next) => {
      try {
            const account = await gmail_accounts_collection.findOne({ userId: String(req.user._id) });
            ok(res, {
                  configured: configured(),
                  connected: Boolean(account),
                  email: account?.email || null,
                  sendFrom: send_from(req.user),
                  sendConfigured: Boolean(await mail_settings_collection.findOne({ userId: String(req.user._id), resendKey: { $exists: true } }, { projection: { _id: 1 } })),
                  companyDomain: CONFIG.companyDomain,
            });
      } catch (e) { next(e); }
};

const auth_url = (req, res, next) => {
      try {
            if (!configured()) throw http_error(503, "Gmail is not configured: add the Google client ID and secret to CONFIG in Modules/gmail_module.js.");
            const e = env();
            // `state` ties the browser redirect back to this user and expires quickly.
            const state = jwt.sign({ purpose: "gmail", userId: String(req.user._id), popup: req.query.popup === "1" }, JWT_SECRET, { expiresIn: "10m" });
            const params = new URLSearchParams({
                  client_id: e.clientId,
                  redirect_uri: e.redirectUri,
                  response_type: "code",
                  scope: SCOPES.join(" "),
                  access_type: "offline",
                  // Always show Google's account chooser: the Gmail to link is often not the dashboard login email.
                  prompt: "select_account consent",
                  state,
            });
            ok(res, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
      } catch (e) { next(e); }
};

const token_request = async (params) => {
      const e = env();
      const r = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: e.clientId, client_secret: e.clientSecret, ...params }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(http_error(r.status === 400 ? 401 : 502, json.error_description || json.error || "Google token error"), { google: json.error });
      return json;
};

// Page shown inside the popup: tells the opener the result, then closes itself.
const popup_page = (result) => `<!doctype html><meta charset="utf-8"><title>Gmail</title>
<body style="font-family:system-ui,sans-serif;background:#0b1220;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p id="m">${result.gmail === "connected" ? "Gmail connected. You can close this window." : "Gmail was not connected. You can close this window."}</p>
<script>
  var result = ${JSON.stringify({ type: "gmail-oauth", ...result }).replace(/</g, "\\u003c")};
  try { if (window.opener) window.opener.postMessage(result, "*"); } catch (e) {}
  setTimeout(function () { window.close(); }, 400);
</script></body>`;

// Browser lands here from Google; there is no Authorization header, so identity comes from `state`.
const callback = async (req, res) => {
      const e = env();
      let popup = false;
      const back = (query) => (popup
            ? res.type("html").send(popup_page(query))
            : res.redirect(`${e.frontend}/dashboard/mail?${new URLSearchParams(query)}`));
      try {
            const { code, state, error } = req.query;
            const claims = jwt.verify(state, JWT_SECRET);
            if (claims.purpose !== "gmail") throw new Error("bad state");
            popup = Boolean(claims.popup);
            if (error) {
                  console.error("Gmail callback: Google returned error:", error, req.query.error_description || "");
                  return back({ gmail: "error", reason: error });
            }

            const tokens = await token_request({ code, grant_type: "authorization_code", redirect_uri: e.redirectUri });
            const granted = String(tokens.scope || "").split(" ");
            if (!SCOPES.every((s) => granted.includes(s))) return back({ gmail: "error", reason: "permissions_missing" });
            if (!tokens.refresh_token) return back({ gmail: "error", reason: "no_refresh_token" });

            const profile = await (await fetch(`${GMAIL}/profile`, { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json();
            if (!profile.emailAddress) {
                  console.error("Gmail callback: profile request failed:", JSON.stringify(profile.error || profile));
                  const disabled = /has not been used|is disabled|accessNotConfigured/i.test(JSON.stringify(profile.error || {}));
                  return back({ gmail: "error", reason: disabled ? "gmail_api_disabled" : "profile_failed" });
            }

            await gmail_accounts_collection.updateOne(
                  { userId: claims.userId },
                  { $set: {
                        userId: claims.userId,
                        email: profile.emailAddress,
                        refreshToken: h.encrypt(tokens.refresh_token, e.encKey),
                        accessToken: tokens.access_token,
                        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
                        connectedAt: new Date().toISOString(),
                  } },
                  { upsert: true }
            );
            back({ gmail: "connected" });
      } catch (err) {
            console.error("Gmail callback failed:", err.message, err.google || "");
            back({ gmail: "error", reason: err.google || "failed" });
      }
};

const disconnect = async (req, res, next) => {
      try {
            const account = await gmail_accounts_collection.findOne({ userId: String(req.user._id) });
            if (account) {
                  try {
                        const refresh = h.decrypt(account.refreshToken, env().encKey);
                        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" });
                  } catch (e) { /* revoking is best effort; the local link is removed regardless */ }
                  await gmail_accounts_collection.deleteOne({ _id: account._id });
            }
            ok(res, null);
      } catch (e) { next(e); }
};

/* ---------- Gmail API calls ---------- */

const access_token = async (account) => {
      if (account.expiresAt > Date.now() + 60000) return account.accessToken;
      try {
            const t = await token_request({ grant_type: "refresh_token", refresh_token: h.decrypt(account.refreshToken, env().encKey) });
            await gmail_accounts_collection.updateOne(
                  { _id: account._id },
                  { $set: { accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in || 3600) * 1000 } }
            );
            return t.access_token;
      } catch (e) {
            if (e.google === "invalid_grant") {
                  // Access was revoked or the password changed: drop the link so the user reconnects.
                  await gmail_accounts_collection.deleteOne({ _id: account._id });
                  throw http_error(401, "Gmail access expired. Please reconnect Gmail.");
            }
            throw e;
      }
};

const gmail = async (account, path, { method = "GET", body } = {}) => {
      const r = await fetch(`${GMAIL}${path}`, {
            method,
            headers: { Authorization: `Bearer ${await access_token(account)}`, "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (r.status === 204) return null;
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw http_error(r.status === 401 ? 502 : r.status, json.error?.message || "Gmail request failed");
      return json;
};

// Loads the signed-in user's linked account for a route handler.
const with_account = (handler) => async (req, res, next) => {
      try {
            if (!configured()) throw http_error(503, "Gmail is not configured on the server.");
            const account = await gmail_accounts_collection.findOne({ userId: String(req.user._id) });
            if (!account) throw http_error(409, "Gmail is not connected.");
            await handler(account, req, res);
      } catch (e) { next(e); }
};

// "all" has no label: every company message that is not in Spam or Trash.
const FOLDERS = { all: null, inbox: "INBOX", sent: "SENT", starred: "STARRED", drafts: "DRAFT", trash: "TRASH", spam: "SPAM" };
const META_HEADERS = ["From", "To", "Subject", "Date"].map((n) => `metadataHeaders=${n}`).join("&");

// Sent mail goes out through Resend, so Gmail never sees it: our own copies live in Mongo (24-hex ids,
// Gmail's are 16-hex).
const is_sent_id = (id) => /^[0-9a-f]{24}$/.test(String(id));

const sent_summary = (d) => ({
      id: String(d._id), threadId: d.threadId || "", snippet: (d.text || "").replace(/\s+/g, " ").slice(0, 140),
      from: d.from, to: d.to, subject: d.subject || "(no subject)", date: d.createdAt, timestamp: new Date(d.createdAt).getTime(),
      unread: false, starred: Boolean(d.starred), labels: ["SENT"],
});

const PAGE = 20;

const list_sent = async (req, res) => {
      const { q = "", pageToken } = req.query;
      const filter = { userId: String(req.user._id) };
      if (q) {
            const rx = new RegExp(String(q).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [{ subject: rx }, { to: rx }, { text: rx }];
      }
      const skip = Math.max(0, Number(pageToken) || 0);
      const docs = await mail_sent_collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(PAGE + 1).toArray();
      ok(res, { messages: docs.slice(0, PAGE).map(sent_summary), nextPageToken: docs.length > PAGE ? String(skip + PAGE) : null });
};

const list_messages = (req, res, next) => {
      const { folder = "inbox", q = "", pageToken, unread } = req.query;
      if (!(folder in FOLDERS)) return next(http_error(400, "Unknown folder"));
      if (folder === "sent") return list_sent(req, res).catch(next);

      return with_account(async (account) => {
            const label = FOLDERS[folder];
            const params = new URLSearchParams({ maxResults: String(PAGE) });
            if (label) params.set("labelIds", label);
            params.set("q", `${company_filter()} ${unread === "1" ? "is:unread " : ""}${String(q).slice(0, 300)}`.trim());
            if (pageToken) params.set("pageToken", String(pageToken));
            if (label === "TRASH" || label === "SPAM") params.set("includeSpamTrash", "true");

            const list = await gmail(account, `/messages?${params}`);
            const messages = await Promise.all(
                  (list.messages || []).map((m) => gmail(account, `/messages/${m.id}?format=metadata&${META_HEADERS}`).then(h.summarize))
            );
            ok(res, { messages, nextPageToken: list.nextPageToken || null });
      })(req, res, next);
};

const get_message = (req, res, next) => {
      if (!is_sent_id(req.params.id)) return with_account(async (account) => {
            const msg = await gmail(account, `/messages/${encodeURIComponent(req.params.id)}?format=full`);
            ok(res, h.full_message(msg));
      })(req, res, next);
      return (async () => {
            try {
                  const d = await mail_sent_collection.findOne({ _id: new ObjectId(req.params.id), userId: String(req.user._id) });
                  if (!d) throw http_error(404, "Message not found");
                  ok(res, {
                        ...sent_summary(d), cc: d.cc || "", replyTo: "", messageId: d.messageId || "", references: d.references || "",
                        html: d.html || "", text: d.text || "",
                        attachments: (d.attachments || []).map((a) => ({ id: null, filename: a.filename, mimeType: a.mimeType, size: a.size })),
                  });
            } catch (e) { next(e); }
      })();
};

const get_attachment = with_account(async (account, req, res) => {
      const a = await gmail(account, `/messages/${encodeURIComponent(req.params.id)}/attachments/${encodeURIComponent(req.params.attId)}`);
      const name = String(req.query.name || "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
      // Always a download, never rendered, so a malicious attachment cannot run in our origin.
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(h.from_b64url(a.data));
});

const MAX_FILES = 10;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const EMAIL_RE = /^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/;
const split_emails = (value) => String(value || "").split(/[,;]+/).map((x) => x.trim()).filter(Boolean);

// Sends through Resend as the employee's company address, then keeps our own copy for the Sent folder.
const send_message = async (req, res, next) => {
      try {
            const apiKey = await user_resend_key(req.user._id);
            if (!apiKey) throw http_error(409, "Add your Resend API key in Mail settings before sending.");
            const { subject, html, text, threadId, inReplyTo, references } = req.body;
            const to = split_emails(req.body.to);
            const cc = split_emails(req.body.cc);
            const bcc = split_emails(req.body.bcc);
            for (const [label, list] of [["To", to], ["Cc", cc], ["Bcc", bcc]]) {
                  const bad = list.find((a) => !EMAIL_RE.test(a));
                  if (bad) throw http_error(400, `${label}: "${bad}" is not a valid email address`);
            }
            if (!to.length) throw http_error(400, "Recipient is required");
            if (!html && !text) throw http_error(400, "Message body is required");

            const files = Array.isArray(req.body.attachments) ? req.body.attachments : [];
            if (files.length > MAX_FILES) throw http_error(400, `At most ${MAX_FILES} attachments`);
            let bytes = 0;
            for (const f of files) {
                  if (!f || typeof f.filename !== "string" || typeof f.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)) {
                        throw http_error(400, "Invalid attachment");
                  }
                  bytes += Math.floor((f.data.length * 3) / 4);
            }
            if (bytes > MAX_ATTACHMENT_BYTES) throw http_error(413, "Attachments are over the 20 MB limit");

            const fromAddress = send_from(req.user);
            const displayName = String(req.user.name || "Bright Future Soft").replace(/["<>\r\n]+/g, "").trim();
            const clean = (v) => h.clean_header(v);

            let info;
            try {
                  info = await transport_for(apiKey).sendMail({
                        from: { name: displayName, address: fromAddress },
                        to, cc, bcc,
                        // Replies come back to the employee's own company mailbox, which this panel reads.
                        replyTo: String(req.user.email || fromAddress),
                        subject: clean(subject) || "(no subject)",
                        html: html || undefined,
                        text: text || undefined,
                        inReplyTo: inReplyTo ? clean(inReplyTo) : undefined,
                        references: references ? clean(references) : undefined,
                        attachments: files.map((f) => ({
                              filename: clean(f.filename),
                              content: f.data,
                              encoding: "base64",
                              contentType: /^[\w.+-]+\/[\w.+-]+$/.test(f.mimeType || "") ? f.mimeType : "application/octet-stream",
                        })),
                  });
            } catch (err) {
                  // 535 = bad API key; 550/553 = the From domain is not verified in Resend.
                  const detail = err.response || err.message;
                  throw http_error(502, err.responseCode === 535 ? "Resend rejected your API key. Update it in Mail settings." : `Resend SMTP: ${detail}`);
            }

            await mail_sent_collection.insertOne({
                  userId: String(req.user._id),
                  messageId: info.messageId || "",
                  from: `${displayName} <${fromAddress}>`,
                  to: to.join(", "), cc: cc.join(", "), bcc: bcc.join(", "),
                  subject: clean(subject) || "(no subject)", html: html || "", text: text || "",
                  threadId: threadId || "", references: references || "",
                  attachments: files.map((f) => ({ filename: f.filename, mimeType: f.mimeType, size: Math.floor((f.data.length * 3) / 4) })),
                  createdAt: new Date().toISOString(),
            });
            ok(res, { id: info.messageId });
      } catch (e) { next(e); }
};

const modify_message = async (req, res, next) => {
      try {
            const { read, starred } = req.body;
            if (is_sent_id(req.params.id)) {
                  if (starred !== undefined) {
                        await mail_sent_collection.updateOne({ _id: new ObjectId(req.params.id), userId: String(req.user._id) }, { $set: { starred: Boolean(starred) } });
                  }
                  return ok(res, null);
            }
            return await with_account(async (account) => {
                  const add = [];
                  const remove = [];
                  if (read === true) remove.push("UNREAD"); else if (read === false) add.push("UNREAD");
                  if (starred === true) add.push("STARRED"); else if (starred === false) remove.push("STARRED");
                  if (!add.length && !remove.length) throw http_error(400, "Nothing to change");
                  await gmail(account, `/messages/${encodeURIComponent(req.params.id)}/modify`, { method: "POST", body: { addLabelIds: add, removeLabelIds: remove } });
                  ok(res, null);
            })(req, res, next);
      } catch (e) { next(e); }
};

const trash_message = async (req, res, next) => {
      try {
            if (is_sent_id(req.params.id)) {
                  await mail_sent_collection.deleteOne({ _id: new ObjectId(req.params.id), userId: String(req.user._id) });
                  return ok(res, null);
            }
            return await with_account(async (account) => {
                  await gmail(account, `/messages/${encodeURIComponent(req.params.id)}/trash`, { method: "POST" });
                  ok(res, null);
            })(req, res, next);
      } catch (e) { next(e); }
};

// Unread inbox mail addressed to the company. Counted exactly by paging through ids: Gmail's own
// resultSizeEstimate is only a rough guess (it reported 201 for two messages). Capped to keep it cheap.
const UNREAD_CAP = 1000;

const unread_count = with_account(async (account, req, res) => {
      let count = 0;
      let pageToken;
      do {
            const params = new URLSearchParams({
                  maxResults: "500", labelIds: "INBOX", q: `is:unread ${company_filter()}`, fields: "messages/id,nextPageToken",
            });
            if (pageToken) params.set("pageToken", pageToken);
            // An empty result comes back as an empty body (null here), not as {}.
            const list = (await gmail(account, `/messages?${params}`)) || {};
            count += (list.messages || []).length;
            pageToken = list.nextPageToken;
      } while (pageToken && count < UNREAD_CAP);
      ok(res, { inbox: count, capped: Boolean(pageToken) });
});

/* ---------- bulk actions ---------- */

const GMAIL_ID = /^[0-9a-f]{12,20}$/;

// Gmail allows 1000 ids per batchModify call.
const batch_modify = async (account, ids, { add = [], remove = [] }) => {
      for (let i = 0; i < ids.length; i += 1000) {
            await gmail(account, "/messages/batchModify", {
                  method: "POST",
                  body: { ids: ids.slice(i, i + 1000), addLabelIds: add, removeLabelIds: remove },
            });
      }
};

// Mark read / unread, star, or trash several messages at once (the selection in the list).
const batch_messages = with_account(async (account, req, res) => {
      const { ids, read, starred, trash } = req.body;
      if (!Array.isArray(ids) || !ids.length) throw http_error(400, "Select at least one message");
      if (ids.length > 500) throw http_error(400, "Too many messages selected");
      if (!ids.every((id) => typeof id === "string" && GMAIL_ID.test(id))) throw http_error(400, "Invalid message id");

      const add = [];
      const remove = [];
      if (read === true) remove.push("UNREAD"); else if (read === false) add.push("UNREAD");
      if (starred === true) add.push("STARRED"); else if (starred === false) remove.push("STARRED");
      if (trash === true) add.push("TRASH");
      if (!add.length && !remove.length) throw http_error(400, "Nothing to change");
      await batch_modify(account, ids, { add, remove });
      ok(res, { count: ids.length });
});

const MARK_ALL_LIMIT = 5000;

// Marks every unread company message in a folder as read, not just the page on screen.
const mark_all_read = with_account(async (account, req, res) => {
      const folder = req.body.folder || "inbox";
      if (!(folder in FOLDERS) || folder === "sent") throw http_error(400, "Unknown folder");
      let count = 0;
      let pageToken;
      do {
            const params = new URLSearchParams({ maxResults: "500", q: `is:unread ${company_filter()}` });
            if (FOLDERS[folder]) params.set("labelIds", FOLDERS[folder]);
            if (FOLDERS[folder] === "TRASH" || FOLDERS[folder] === "SPAM") params.set("includeSpamTrash", "true");
            if (pageToken) params.set("pageToken", pageToken);
            const list = (await gmail(account, `/messages?${params}`)) || {};
            const ids = (list.messages || []).map((m) => m.id);
            if (ids.length) await batch_modify(account, ids, { remove: ["UNREAD"] });
            count += ids.length;
            pageToken = list.nextPageToken;
      } while (pageToken && count < MARK_ALL_LIMIT);
      ok(res, { count, more: Boolean(pageToken) });
});

/* ---------- per-user sending settings ---------- */

const mail_settings = async (req, res, next) => {
      try {
            const row = await mail_settings_collection.findOne({ userId: String(req.user._id) });
            // The key itself is never sent back, only a hint.
            ok(res, {
                  hasKey: Boolean(row?.resendKey),
                  keyHint: row?.keyHint || null,
                  sendFrom: send_from(req.user),
                  smtp: { host: CONFIG.smtp.host, port: CONFIG.smtp.port, user: CONFIG.smtp.user },
            });
      } catch (e) { next(e); }
};

const save_mail_settings = async (req, res, next) => {
      try {
            const key = String(req.body.resendKey || "").trim();
            if (!/^re_[A-Za-z0-9_\-]{8,}$/.test(key)) throw http_error(400, "That doesn't look like a Resend API key (it starts with re_).");
            try {
                  await transport_for(key).verify();
            } catch (err) {
                  throw http_error(400, err.responseCode === 535 ? "Resend rejected this API key." : `Could not reach Resend: ${err.message}`);
            }
            await mail_settings_collection.updateOne(
                  { userId: String(req.user._id) },
                  { $set: { userId: String(req.user._id), resendKey: h.encrypt(key, CONFIG.encKey), keyHint: `re_…${key.slice(-4)}`, updatedAt: new Date().toISOString() } },
                  { upsert: true }
            );
            ok(res, { hasKey: true, keyHint: `re_…${key.slice(-4)}` });
      } catch (e) { next(e); }
};

const delete_mail_settings = async (req, res, next) => {
      try {
            await mail_settings_collection.deleteOne({ userId: String(req.user._id) });
            ok(res, null);
      } catch (e) { next(e); }
};

module.exports = {
      batch_messages, mark_all_read,
      mail_settings, save_mail_settings, delete_mail_settings, status, auth_url, callback, disconnect, list_messages, get_message, get_attachment, send_message, modify_message, trash_message, unread_count };
