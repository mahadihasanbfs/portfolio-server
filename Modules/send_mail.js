const fetch = require("node-fetch");

const send_mail_candidate = async (req, res, next) => {
      try {
            const requestBody = req.body;


            const response = await fetch("https://api.brevo.com/v3/smtp/email", {
                  method: "POST",
                  headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        "api-key": "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",
                  },
                  body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            res.status(response.ok ? 200 : response.status).json(data);
      } catch (error) {
            console.error("Error sending email via Brevo:", error);
            res.status(500).json({
                  success: false,
                  message: "Failed to send email",
                  error: error.message,
            });
      }
}


module.exports = { send_mail_candidate };
