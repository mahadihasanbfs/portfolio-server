const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
            user: 'brightfuturesoft@gmail.com',
            pass: process.env.GMAIL_APP_PASSWORD || 'swvo mijf zdrv soar', // Use env variable in production!
      },
});

const send_mail_candidate = async (req, res) => {
      try {
            const { sender, to, subject, htmlContent, textContent } = req.body;

            // 1️⃣ Configure SMTP Transporter (Brevo)
            // const transporter = nodemailer.createTransport({
            //       host: "smtp-relay.brevo.com",
            //       port: 587,
            //       secure: false, // use STARTTLS
            //       auth: {
            //             user: "7966ba002@smtp-brevo.com", // Brevo SMTP login
            //             pass: "1hA3OpDNFH5TxVsy", // Replace with your Brevo SMTP password
            //       },
            // });

            // const transporter = transporter
            // 2️⃣ Extract recipient emails
            const toEmails = to?.map((item) => item.email) || [];

            // 3️⃣ Mail options
            const mailOptions = {
                  from: `"${sender?.name || "Bright Future Soft HR"}" <${"hr@brightfuturesoft.com"}>`,
                  to: toEmails,
                  subject,
                  text: textContent,
                  html: htmlContent,
            };

            // 4️⃣ Send the mail
            const info = await transporter.sendMail(mailOptions);
            console.log("✅ Email sent successfully:", info.messageId);

            res.json({
                  success: true,
                  message: "Email sent successfully",
                  messageId: info.messageId,
            });
      } catch (error) {
            console.error("❌ Error sending email:", error);
            res.status(500).json({
                  success: false,
                  message: "Failed to send email",
                  error: error.message,
            });
      }
};

module.exports = { send_mail_candidate };
