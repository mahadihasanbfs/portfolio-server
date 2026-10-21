const test = require('node:test');
const assert = require('node:assert');
const h = require('./gmail_helpers');

const decode_raw = (raw) => h.from_b64url(raw).toString('utf8');

test('encrypt/decrypt round trip; wrong key fails', () => {
      const packed = h.encrypt('1//refresh-token', 'secret-a');
      assert.ok(!packed.includes('refresh-token'));
      assert.strictEqual(h.decrypt(packed, 'secret-a'), '1//refresh-token');
      assert.throws(() => h.decrypt(packed, 'secret-b'));
});

test('raw message: plain text with UTF-8 subject', () => {
      const raw = decode_raw(h.build_raw_message({ from: 'a@x.com', to: 'b@y.com', subject: 'Invoice ৳500', text: 'hello' }));
      assert.match(raw, /^From: a@x.com\r\nTo: b@y.com\r\nSubject: =\?UTF-8\?B\?/);
      assert.match(raw, /Content-Type: text\/plain; charset="UTF-8"/);
      assert.ok(raw.endsWith(Buffer.from('hello').toString('base64')));
});

test('raw message: header injection is neutralised', () => {
      const raw = decode_raw(h.build_raw_message({
            from: 'a@x.com', to: 'b@y.com\r\nBcc: evil@z.com', subject: 'Hi\r\nBcc: evil@z.com', text: 'x',
      }));
      assert.ok(!/^Bcc:/m.test(raw));
});

test('raw message: reply headers and multipart', () => {
      const raw = decode_raw(h.build_raw_message({
            from: 'a@x.com', to: 'b@y.com', subject: 'Re: Hi', html: '<b>hi</b>', text: 'hi',
            inReplyTo: '<id1@mail>', references: '<id0@mail> <id1@mail>',
      }));
      assert.match(raw, /In-Reply-To: <id1@mail>/);
      assert.match(raw, /References: <id0@mail> <id1@mail>/);
      assert.match(raw, /multipart\/alternative/);
});

test('parse_payload finds nested html, text and attachments', () => {
      const enc = (s) => h.b64url(s);
      const payload = {
            mimeType: 'multipart/mixed',
            parts: [
                  { mimeType: 'multipart/alternative', parts: [
                        { mimeType: 'text/plain', body: { data: enc('plain body') } },
                        { mimeType: 'text/html', body: { data: enc('<p>html body</p>') } },
                  ] },
                  { mimeType: 'application/pdf', filename: 'inv.pdf', body: { attachmentId: 'att1', size: 1234 } },
            ],
      };
      const p = h.parse_payload(payload);
      assert.strictEqual(p.text, 'plain body');
      assert.strictEqual(p.html, '<p>html body</p>');
      assert.deepStrictEqual(p.attachments, [{ id: 'att1', filename: 'inv.pdf', mimeType: 'application/pdf', size: 1234 }]);
});

test('summarize reads headers and labels', () => {
      const s = h.summarize({
            id: '1', threadId: 't', snippet: 'snip', internalDate: '1700000000000', labelIds: ['INBOX', 'UNREAD', 'STARRED'],
            payload: { headers: [{ name: 'from', value: 'A <a@x.com>' }, { name: 'Subject', value: 'Hello' }] },
      });
      assert.strictEqual(s.from, 'A <a@x.com>');
      assert.strictEqual(s.subject, 'Hello');
      assert.ok(s.unread && s.starred);
});

test('snippet entities are decoded', () => {
      assert.strictEqual(h.decode_entities('You allowed a@b.com&#39;s Apps &amp; more &lt;ok&gt;'), "You allowed a@b.com's Apps & more <ok>");
      const s = h.summarize({ id: '1', snippet: 'DON&#39;T FORGET', payload: { headers: [] } });
      assert.strictEqual(s.snippet, "DON'T FORGET");
});

test('raw message with attachments is multipart/mixed and keeps the file bytes', () => {
      const data = Buffer.from('%PDF-1.4 hello').toString('base64');
      const raw = decode_raw(h.build_raw_message({
            from: 'a@x.com', to: 'b@y.com', subject: 'Files', html: '<b>hi</b>', text: 'hi',
            attachments: [{ filename: 'inv "1".pdf', mimeType: 'application/pdf', data }],
      }));
      assert.match(raw, /Content-Type: multipart\/mixed/);
      assert.match(raw, /multipart\/alternative/);
      assert.match(raw, /Content-Disposition: attachment; filename="inv '1'.pdf"/);
      assert.ok(raw.includes(data));
});

test('attachment with bad mime type falls back to octet-stream; no header injection via filename', () => {
      const raw = decode_raw(h.build_raw_message({
            from: 'a@x.com', to: 'b@y.com', subject: 's', text: 'x',
            attachments: [{ filename: 'a.txt\r\nBcc: evil@z.com', mimeType: 'text/html\r\nX: y', data: 'QQ==' }],
      }));
      assert.match(raw, /application\/octet-stream/);
      assert.ok(!/^Bcc:/m.test(raw));
});
