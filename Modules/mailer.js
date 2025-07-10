const nodemailer = require('nodemailer');
const ical = require('ical-generator').default; // Use .default for v3+ of ical-generator

// Configure transporter for Gmail
const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
            user: 'brightfuturesoft@gmail.com',
            pass: process.env.GMAIL_APP_PASSWORD || 'swvo mijf zdrv soar', // Use env variable in production!
      },
});

async function sendMeetingInvite({ to, title, agenda, date, duration, link, attendees = [] }) {
      const startTime = new Date(date);
      const endTime = new Date(startTime.getTime() + duration * 60000);

      const cal = ical({ name: title });
      cal.createEvent({
            start: startTime,
            end: endTime,
            summary: title,
            description: `${agenda.replace(/<[^>]+>/g, "")}\n\nMeet Link: ${link}`,
            location: link,
            organizer: { name: "Bright Future Soft", email: "brightfuturesoft@gmail.com" },
            attendees: attendees.map((u) => ({ name: u.name, email: u.email })),
      });

      const formattedDate = startTime.toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
      });

      const formattedTime = startTime.toLocaleString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
      });

      const plainText = `You're invited to a meeting by Bright Future Soft.

Title: ${title}
Date & Time: ${formattedDate}
Duration: ${duration} minutes
Agenda: ${agenda.replace(/<[^>]+>/g, "")}
Meeting Link: ${link}

Please save this date and join us at the scheduled time.

Best regards,
Bright Future Soft Team`;

      // Wonderful & Classic HTML Email Design
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Invitation</title>
  <link href="https://fonts.googleapis.com/css?family=Playfair+Display:700|Nunito:400,600&display=swap" rel="stylesheet">
</head>
<body style="margin:0; padding:0; background: #f3f4f6; font-family: 'Nunito', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background:#fff; border-radius:14px; box-shadow:0 8px 32px rgba(0,0,0,0.12); border:1px solid #e4eaf1; overflow:hidden;">
          <!-- Header -->
          <tr>
            <td align="center" style="background:linear-gradient(90deg, #3056d3 0%, #ffd700 100%); padding:36px 10px 22px 10px;">
              <img src="https://www.brightfuturesoft.com/static/media/logo.f35f04f782ea6b4a59b2.webp" alt="Bright Future Soft" height="44" style="margin-bottom:18px;border-radius:4px;">
              <h1 style="margin:0; font-family:'Playfair Display', serif; font-size:30px; color:#fff; font-weight:700; letter-spacing:-1px;">
                Meeting Invitation
              </h1>
              <p style="margin:17px 0 0 0; color:#f9fafb; font-size:16px; font-weight:400;">You are cordially invited</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 24px 36px;">
              <!-- Title -->
              <div style="text-align:center; margin-bottom:24px;">
                <h2 style="font-family:'Playfair Display',serif; color:#2d3748; font-size:24px; margin:0 0 6px 0;">${title}</h2>
                <div style="color:#8e99aa; font-size:15px; margin-bottom:8px; font-style:italic;">An invitation from Bright Future Soft</div>
              </div>
              <!-- Details Row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
                <tr>
                  <td style="padding:10px 0; color:#3056d3; font-weight:600; font-size:15px; width:110px;">🗓 Date:</td>
                  <td style="padding:10px 0; color:#222; font-size:15px;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0; color:#3056d3; font-weight:600; font-size:15px;">⏰ Time:</td>
                  <td style="padding:10px 0; color:#222; font-size:15px;">${formattedTime}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0; color:#3056d3; font-weight:600; font-size:15px;">⏱ Duration:</td>
                  <td style="padding:10px 0; color:#222; font-size:15px;">${duration} minutes</td>
                </tr>
                <tr>
                  <td style="padding:10px 0; color:#3056d3; font-weight:600; font-size:15px;">📍 Location:</td>
                  <td style="padding:10px 0; color:#222; font-size:15px;">
                    <a href="${link}" target="_blank" style="color:#3056d3; text-decoration:underline;">Join Meeting</a>
                  </td>
                </tr>
                ${attendees.length > 0
                  ? `<tr>
                        <td style="padding:10px 0; color:#3056d3; font-weight:600; font-size:15px;">👥 Attendees:</td>
                        <td style="padding:10px 0; color:#222; font-size:15px;">
                          ${attendees.slice(0, 3).map(a => a.name).join(", ")}${attendees.length > 3 ? ` and ${attendees.length - 3} more` : ""}
                        </td>
                      </tr>`
                  : ""
            }
              </table>
              <!-- Agenda -->
              <div style="margin-bottom:28px;">
                <div style="font-weight:600; color:#3056d3; font-size:16px; margin-bottom:7px;">📋 Agenda</div>
                <div style="padding:17px 18px; border:1px solid #ececec; border-radius:8px; background:#fafbfc; color:#444; font-size:15px;">
                  ${agenda}
                </div>
              </div>
              <!-- CTA Button -->
              <div style="text-align:center; margin:30px 0;">
                <a href="${link}" target="_blank"
                  style="padding:15px 38px; border-radius:8px; background:linear-gradient(90deg,#3056d3 0%, #ffd700 100%); color:#23272f; font-size:17px; font-weight:700; text-decoration:none; box-shadow:0 2px 8px rgba(48,86,211,0.08); letter-spacing:0.5px;">
                  Join Meeting
                </a>
              </div>
              <!-- Meeting Link (for copy) -->
              <div style="background:#f8fafc; border-radius:7px; padding:12px 16px; text-align:center; color:#3056d3; font-size:14px; margin-bottom:18px;">
                Or copy this link: <br>
                <a href="${link}" style="color:#3056d3; text-decoration:underline; word-break:break-all;">${link}</a>
              </div>
              <!-- Notes -->
              <div style="margin:0 0 20px 0; color:#bfa43a; background:#fffbe7; border-left:4px solid #ffd700; border-radius:6px; padding:14px 16px; font-size:14px;">
                <b>Tip:</b> Please join 2-3 minutes early to test your audio and video.<br>
                Ensure a stable connection and a quiet environment.
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="background:#f3f4f6; color:#888; font-size:13px; padding:24px 36px;">
              <div style="margin-bottom:6px; font-family:'Playfair Display',serif; font-weight:700; color:#3056d3;">Bright Future Soft</div>
              <div style="margin-bottom:8px;">Envisioning the FUTURE, Building the SOFTWARE.</div>
              <div style="color:#bbb;">If you have any questions, contact <a href="mailto:info@brightfuturesoft.com" style="color:#3056d3;">info@brightfuturesoft.com</a></div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

      await transporter.sendMail({
            from: '"Bright Future Soft" <brightfuturesoft@gmail.com>',
            to: to,
            subject: `📅 Meeting Invite: ${title}`,
            text: plainText,
            html: htmlContent,
            icalEvent: {
                  filename: "invite.ics",
                  method: "REQUEST",
                  content: cal.toString(),
            },
      });
}

module.exports = { sendMeetingInvite };
