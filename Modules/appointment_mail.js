// Emails for appointments: confirmation, team notice, reschedule, cancellation and reminders.
const ical = require("ical-generator").default;
const { transporter } = require("./mailer");
const google = require("./appointment_google");
const { office_sync } = require("./appointment_office");
const { prep_for } = require("./appointment_types");

const IS_PROD = process.env.NODE_ENV === "production";
const SITE = IS_PROD ? "https://www.brightfuturesoft.com" : "http://localhost:5173";
const FROM = '"Bright Future Soft" <brightfuturesoft@gmail.com>';
const TEAM_EMAIL = process.env.APPOINTMENT_TEAM_EMAIL || "contact@brightfuturesoft.com";
const BLUE = "#0A65B4";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const safe_tz = (tz) => {
      try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "Asia/Dhaka"; }
};

const when = (iso, tz) =>
      new Date(iso).toLocaleString("en-US", { timeZone: safe_tz(tz), weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

const MODE = { online: "Online meeting", phone: "Phone call", office: "At our office", client_site: "We visit your office" };

// Where the meeting happens when it is in person: { name, address, map_url } or null.
const place = (a) => a.mode === "office" ? office_sync() : a.mode === "client_site" ? { name: "Your office", address: a.visit_address, map_url: a.visit_map_url } : null;

const manage_url = (a) => `${SITE}/book/manage/${a._id}?token=${a.cancel_token}`;

const row = (k, v) => v ? `<tr><td style="padding:8px 0;color:#8794A4;font-size:13px;width:90px;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;color:#142235;font-size:14px;font-weight:600">${v}</td></tr>` : "";

const layout = ({ eyebrow, heading, intro, a, tz, extra = "", button }) => `<!DOCTYPE html>
<html><body style="margin:0;background:#F7FAFF;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAFF;padding:32px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #E1E9F2">
<tr><td style="height:4px;background:${BLUE}"></td></tr>
<tr><td style="padding:32px 32px 8px">
<p style="margin:0;color:${BLUE};font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase">${esc(eyebrow)}</p>
<h1 style="margin:10px 0 8px;color:#142235;font-size:24px;line-height:1.25">${esc(heading)}</h1>
<p style="margin:0;color:#66758A;font-size:15px;line-height:1.6">${intro}</p></td></tr>
<tr><td style="padding:8px 32px 8px"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E1E9F2;border-bottom:1px solid #E1E9F2;margin:16px 0">
${row("What", `${esc(a.type_name)} · ${a.duration_minutes} min`)}
${row("When", esc(when(a.start_time, tz)))}
${row("How", a.mode === "phone" && a.phone ? `Phone call: we will call ${esc(a.phone)}` : esc(MODE[a.mode] || MODE.online))}
${a.mode === "online" ? row("Meeting link", a.meet_link ? `<a href="${esc(a.meet_link)}" style="color:${BLUE}">${esc(a.meet_link)}</a>` : "Link will be sent before the meeting") : ""}
${place(a) ? row("Where", `${esc(place(a).name)}<br><span style="font-weight:400;color:#66758A">${esc(place(a).address)}</span><br><a href="${esc(place(a).map_url)}" style="color:${BLUE}">Open in Maps</a>`) : ""}
${row("Who", `${esc(a.name)}${a.company ? `, ${esc(a.company)}` : ""}`)}
${row("Reference", esc(String(a._id).slice(-8).toUpperCase()))}
</table>${extra}</td></tr>
${button ? `<tr><td style="padding:0 32px 8px"><a href="${esc(button.url)}" style="display:inline-block;background:${BLUE};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 24px">${esc(button.label)}</a></td></tr>` : ""}
<tr><td style="padding:16px 32px 32px;color:#8794A4;font-size:12px;line-height:1.6">Times above are shown in ${esc(safe_tz(tz))}. Bright Future Soft · brightfuturesoft.com</td></tr>
</table></td></tr></table></body></html>`;

// "How to prepare" block: what the meeting is plus a short checklist.
const prep_block = (a) => {
      const p = prep_for(a);
      const items = [...(p.prepare || []), ...(p.mode?.tips || [])];
      if (!items.length) return "";
      return `<div style="margin:0 0 16px;padding:16px;background:#F1F8FF;border:1px solid #E1E9F2"><p style="margin:0 0 8px;color:${BLUE};font-size:12px;font-weight:700;letter-spacing:.15em;text-transform:uppercase">How to prepare</p>${p.mode ? `<p style="margin:0 0 10px;color:#142235;font-size:14px;line-height:1.5">${esc(p.mode.summary)}</p>` : ""}<ul style="margin:0;padding-left:18px;color:#66758A;font-size:13px;line-height:1.7">${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
};

const manage_note = (a) => `<p style="margin:0 0 16px;color:#66758A;font-size:13px;line-height:1.6">Need to change the time or cancel? <a href="${esc(manage_url(a))}" style="color:${BLUE}">Manage your appointment</a>.</p>`;

const ics_for = (a, method = "REQUEST") => {
      const cal = ical({ name: a.type_name, method });
      cal.createEvent({
            id: `${a._id}@brightfuturesoft.com`,
            start: new Date(a.start_time),
            end: new Date(new Date(a.start_time).getTime() + a.duration_minutes * 60000),
            summary: `${a.type_name} with Bright Future Soft`,
            description: `${a.meet_link ? `Join: ${a.meet_link}\n` : ""}${place(a) ? `Map: ${place(a).map_url}\n` : ""}Manage: ${manage_url(a)}`,
            location: place(a) ? `${place(a).name}, ${place(a).address}` : (a.meet_link || MODE[a.mode] || ""),
            url: a.meet_link || undefined,
            organizer: { name: "Bright Future Soft", email: "brightfuturesoft@gmail.com" },
            attendees: [{ name: a.name, email: a.email }],
      });
      return { filename: "appointment.ics", content: cal.toString(), contentType: `text/calendar; method=${method}` };
};

// Preferred: the connected Google account (Gmail API). Fallback: the SMTP login in mailer.js.
const send = async (opts) => {
      try {
            if (await google.send_mail(opts)) return true;
      } catch (err) {
            console.error("Gmail API send failed, trying SMTP:", err.message);
      }
      try {
            await transporter.sendMail({ from: FROM, ...opts });
            return true;
      } catch (err) {
            console.error("Appointment email failed:", err.message);
            return false;
      }
};

const team_text = (a) => `${a.mode === "online" && !a.meet_link ? `<p style="margin:0 0 12px;padding:10px 12px;background:#FFF7E6;border:1px solid #F5D9A0;color:#8A5A00;font-size:13px">No Google Meet link was created. Connect Google Calendar in Dashboard > Appointments, or send the visitor a meeting link manually.</p>` : ""}<p style="margin:0 0 12px;color:#142235;font-size:14px"><strong>${esc(a.name)}</strong>${a.company ? ` (${esc(a.company)})` : ""}<br>${esc(a.email)}${a.phone ? `<br>${esc(a.phone)}` : ""}</p>${a.agenda ? `<p style="margin:0 0 4px;color:#8794A4;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Agenda</p><p style="margin:0 0 12px;color:#142235;font-size:14px;white-space:pre-wrap">${esc(a.agenda)}</p>` : ""}${a.topic ? `<p style="margin:0 0 12px;color:#66758A;font-size:14px;white-space:pre-wrap">${esc(a.topic)}</p>` : ""}`;

/* ---------- senders: each returns true when the visitor email went out ---------- */

const confirmation = async (a) => {
      const tz = a.tz;
      const ok = await send({
            to: a.email,
            subject: `Confirmed: ${a.type_name} on ${when(a.start_time, tz)}`,
            html: layout({ eyebrow: "Appointment confirmed", heading: "You're booked in", intro: `Hi ${esc(a.name)}, your ${esc(a.type_name)} is confirmed. A calendar invite is attached.`, a, tz, extra: prep_block(a) + manage_note(a), button: a.meet_link ? { label: "Join meeting", url: a.meet_link } : { label: "Manage appointment", url: manage_url(a) } }),
            attachments: [ics_for(a)],
      });
      await send({
            to: TEAM_EMAIL,
            subject: `New booking: ${a.type_name} with ${a.name}`,
            html: layout({ eyebrow: "New booking", heading: `${a.name} booked a ${a.type_name}`, intro: "", a, tz: "Asia/Dhaka", extra: team_text(a) }),
      });
      return ok;
};

// Sent when a Meet link is created after the booking (for example right after Google is connected).
const link_added = async (a) => send({
      to: a.email,
      subject: `Your meeting link: ${a.type_name} on ${when(a.start_time, a.tz)}`,
      html: layout({ eyebrow: "Meeting link ready", heading: "Here is your Google Meet link", intro: `Hi ${esc(a.name)}, the link for your ${esc(a.type_name)} is ready. The calendar invite is updated too.`, a, tz: a.tz, extra: manage_note(a), button: { label: "Join meeting", url: a.meet_link } }),
      attachments: [ics_for(a)],
});

const rescheduled = async (a, old_start) => {
      await send({
            to: a.email,
            subject: `Rescheduled: ${a.type_name} is now ${when(a.start_time, a.tz)}`,
            html: layout({ eyebrow: "Appointment rescheduled", heading: "Your new time is confirmed", intro: `Hi ${esc(a.name)}, your appointment moved from <s>${esc(when(old_start, a.tz))}</s> to the time below. The calendar invite is updated.`, a, tz: a.tz, extra: manage_note(a), button: a.meet_link ? { label: "Join meeting", url: a.meet_link } : { label: "Manage appointment", url: manage_url(a) } }),
            attachments: [ics_for(a)],
      });
      await send({
            to: TEAM_EMAIL,
            subject: `Rescheduled: ${a.name} (${a.type_name})`,
            html: layout({ eyebrow: "Rescheduled", heading: `${a.name} moved their appointment`, intro: `Was ${esc(when(old_start, "Asia/Dhaka"))}.`, a, tz: "Asia/Dhaka", extra: team_text(a) }),
      });
};

const cancelled = async (a, by) => {
      await send({
            to: a.email,
            subject: `Cancelled: ${a.type_name} on ${when(a.start_time, a.tz)}`,
            html: layout({ eyebrow: "Appointment cancelled", heading: "Your appointment was cancelled", intro: by === "visitor" ? "As requested, we cancelled this appointment." : "Our team had to cancel this appointment. We are sorry for the inconvenience.", a, tz: a.tz, extra: `<p style="margin:0 0 16px;color:#66758A;font-size:13px">You can book a new time any time.</p>`, button: { label: "Book a new time", url: `${SITE}/book` } }),
            attachments: [ics_for(a, "CANCEL")],
      });
      if (by === "visitor") {
            await send({
                  to: TEAM_EMAIL,
                  subject: `Cancelled by visitor: ${a.name} (${a.type_name})`,
                  html: layout({ eyebrow: "Cancelled", heading: `${a.name} cancelled`, intro: "", a, tz: "Asia/Dhaka", extra: team_text(a) }),
            });
      }
};

const reminder = async (a, label) => {
      const ok = await send({
            to: a.email,
            subject: `Reminder: ${a.type_name} ${label}`,
            html: layout({ eyebrow: "Appointment reminder", heading: `Your appointment is ${label}`, intro: `Hi ${esc(a.name)}, this is a reminder about your upcoming ${esc(a.type_name)}.`, a, tz: a.tz, extra: prep_block(a) + manage_note(a), button: a.meet_link ? { label: "Join meeting", url: a.meet_link } : { label: "Manage appointment", url: manage_url(a) } }),
      });
      await send({
            to: TEAM_EMAIL,
            subject: `Reminder: ${a.type_name} with ${a.name} ${label}`,
            html: layout({ eyebrow: "Upcoming appointment", heading: `${a.type_name} with ${a.name} ${label}`, intro: "", a, tz: "Asia/Dhaka", extra: team_text(a) }),
      });
      return ok;
};

module.exports = { link_added, confirmation, rescheduled, cancelled, reminder, manage_url };
