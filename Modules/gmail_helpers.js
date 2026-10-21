// Pure helpers for the Gmail integration: no network, so they can be tested alone.
const crypto = require('crypto');

/* ---------- token encryption (refresh tokens are stored encrypted) ---------- */

const key_from = (secret) => crypto.createHash('sha256').update(String(secret)).digest();

const encrypt = (plain, secret) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key_from(secret), iv);
      const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
};

const decrypt = (packed, secret) => {
      const [iv, tag, data] = String(packed).split('.').map((p) => Buffer.from(p, 'base64'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', key_from(secret), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

/* ---------- outgoing message ---------- */

// Subject and display names may contain non-ASCII; RFC 2047 encoded-word keeps them intact.
const encode_header = (text) =>
      /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

// Header values must never contain line breaks, or a caller could inject extra headers.
const clean_header = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();

const b64url = (buf) =>
      Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const from_b64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const wrap76 = (b64) => b64.replace(/(.{76})/g, '$1\r\n');

const text_part = (type, content) =>
      `Content-Type: ${type}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(Buffer.from(content, 'utf8').toString('base64'))}\r\n`;

// attachments: [{ filename, mimeType, data }] where data is plain base64.
const build_raw_message = ({ from, to, cc, bcc, subject, html, text, inReplyTo, references, attachments = [] }) => {
      const headers = [
            `From: ${clean_header(from)}`,
            `To: ${clean_header(to)}`,
            cc ? `Cc: ${clean_header(cc)}` : null,
            bcc ? `Bcc: ${clean_header(bcc)}` : null,
            `Subject: ${encode_header(clean_header(subject))}`,
            inReplyTo ? `In-Reply-To: ${clean_header(inReplyTo)}` : null,
            references ? `References: ${clean_header(references)}` : null,
            'MIME-Version: 1.0',
      ].filter(Boolean);

      const random = () => crypto.randomBytes(12).toString('hex');

      // The readable body: html (+ plain text fallback) or just one of them.
      let bodyHeaders;
      let body;
      if (html && text) {
            const alt = `bfs_alt_${random()}`;
            bodyHeaders = `Content-Type: multipart/alternative; boundary="${alt}"`;
            body = `--${alt}\r\n${text_part('text/plain', text)}--${alt}\r\n${text_part('text/html', html)}--${alt}--`;
      } else {
            bodyHeaders = `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64`;
            body = wrap76(Buffer.from(html || text || '', 'utf8').toString('base64'));
      }

      if (!attachments.length) {
            return b64url(`${headers.join('\r\n')}\r\n${bodyHeaders}\r\n\r\n${body}`);
      }

      const mixed = `bfs_mix_${random()}`;
      const files = attachments.map((a) => {
            const name = encode_header(clean_header(a.filename).replace(/"/g, "'"));
            const type = /^[\w.+-]+\/[\w.+-]+$/.test(a.mimeType || '') ? a.mimeType : 'application/octet-stream';
            return `--${mixed}\r\nContent-Type: ${type}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(a.data)}\r\n`;
      });
      const full = `--${mixed}\r\n${bodyHeaders}\r\n\r\n${body}\r\n${files.join('')}--${mixed}--`;
      return b64url(`${headers.join('\r\n')}\r\nContent-Type: multipart/mixed; boundary="${mixed}"\r\n\r\n${full}`);
};

/* ---------- incoming message ---------- */

const header = (payload, name) =>
      payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

// Walks the MIME tree: first text/html and text/plain bodies, plus attachment descriptors.
const parse_payload = (payload) => {
      const out = { html: '', text: '', attachments: [] };
      const walk = (part) => {
            if (!part) return;
            const { mimeType = '', body = {}, filename } = part;
            if (filename && body.attachmentId) {
                  out.attachments.push({ id: body.attachmentId, filename, mimeType, size: body.size || 0 });
            } else if (body.data && mimeType === 'text/html' && !out.html) {
                  out.html = from_b64url(body.data).toString('utf8');
            } else if (body.data && mimeType === 'text/plain' && !out.text) {
                  out.text = from_b64url(body.data).toString('utf8');
            }
            (part.parts || []).forEach(walk);
      };
      walk(payload);
      return out;
};

// Gmail returns snippets HTML-escaped (&#39; &amp; ...); show them as plain text.
const decode_entities = (text = '') =>
      String(text)
            .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
            .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
            .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&');

const summarize = (msg) => ({
      id: msg.id,
      threadId: msg.threadId,
      snippet: decode_entities(msg.snippet),
      from: header(msg.payload, 'From'),
      to: header(msg.payload, 'To'),
      subject: header(msg.payload, 'Subject') || '(no subject)',
      date: header(msg.payload, 'Date'),
      timestamp: Number(msg.internalDate) || 0,
      unread: (msg.labelIds || []).includes('UNREAD'),
      starred: (msg.labelIds || []).includes('STARRED'),
      labels: msg.labelIds || [],
});

const full_message = (msg) => ({
      ...summarize(msg),
      cc: header(msg.payload, 'Cc'),
      replyTo: header(msg.payload, 'Reply-To'),
      messageId: header(msg.payload, 'Message-ID'),
      references: header(msg.payload, 'References'),
      ...parse_payload(msg.payload),
});

module.exports = {
      encrypt, decrypt, encode_header, clean_header, b64url, from_b64url,
      build_raw_message, decode_entities, header, parse_payload, summarize, full_message,
};
