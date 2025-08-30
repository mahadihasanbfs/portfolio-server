const fetch = require("node-fetch")

// In-memory storage (replace with proper database in production)
let receivedEmails = []
const sentEmails = []

// Enhanced email fetching with full message details
exports.getAllMail = async (req, res, next) => {
      try {
            const { email } = req.query

            if (!email) {
                  return res.status(400).json({
                        error: "Email parameter is required",
                        success: false,
                  })
            }

            console.log(`Fetching emails for: ${email}`)

            // Fetch from Brevo API with improved parameters
            const response = await fetch(
                  `https://api.brevo.com/v3/smtp/emails?email=${encodeURIComponent(email)}&limit=100&sort=desc`,
                  {
                        method: "GET",
                        headers: {
                              "api-key":
                                    process.env.BREVO_API_KEY ||
                                    "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",
                              accept: "application/json",
                        },
                  },
            )

            if (!response.ok) {
                  const errorData = await response.json().catch(() => ({}))
                  console.error("Brevo API error:", response.status, errorData)
                  throw new Error(`Brevo API error: ${response.status} - ${errorData.message || "Unknown error"}`)
            }

            const data = await response.json()
            console.log(`Fetched ${data.transactionalEmails?.length || 0} emails`)

            // Process and enhance email data with full content
            const processedEmails = await Promise.all(
                  (data.transactionalEmails || []).map(async (email) => {
                        try {
                              // Get full email details if messageId is available
                              let fullContent = email.text || email.textContent || ""
                              let htmlContent = email.htmlContent || ""

                              // If we have a messageId, try to get more details
                              if (email.messageId) {
                                    try {
                                          const detailResponse = await fetch(
                                                `https://api.brevo.com/v3/smtp/emails/${email.messageId}`,
                                                {
                                                      method: "GET",
                                                      headers: {
                                                            "api-key":
                                                                  process.env.BREVO_API_KEY ||
                                                                  "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",
                                                            accept: "application/json",
                                                      },
                                                },
                                          )

                                          if (detailResponse.ok) {
                                                const detailData = await detailResponse.json()
                                                fullContent = detailData.textContent || detailData.text || fullContent
                                                htmlContent = detailData.htmlContent || htmlContent
                                          }
                                    } catch (detailError) {
                                          console.warn(`Failed to fetch details for email ${email.messageId}:`, detailError.message)
                                    }
                              }

                              return {
                                    ...email,
                                    text: fullContent || "No message content available",
                                    htmlContent: htmlContent,
                                    isRead: Math.random() > 0.3, // Mock read status
                                    isStarred: Math.random() > 0.8, // Mock starred status
                                    attachments: email.attachments || [],
                                    // Ensure we have proper date formatting
                                    date: email.date || new Date().toISOString(),
                                    // Add unique identifier
                                    uuid: email.uuid || email.messageId || `email_${Date.now()}_${Math.random()}`,
                              }
                        } catch (processError) {
                              console.error("Error processing email:", processError)
                              return {
                                    ...email,
                                    text: "Error loading message content",
                                    isRead: false,
                                    isStarred: false,
                                    attachments: [],
                                    date: email.date || new Date().toISOString(),
                                    uuid: email.uuid || email.messageId || `email_${Date.now()}_${Math.random()}`,
                              }
                        }
                  }),
            )

            receivedEmails = processedEmails

            res.json({
                  emails: processedEmails,
                  total: processedEmails.length,
                  success: true,
            })
      } catch (error) {
            console.error("Error fetching emails:", error)
            res.status(500).json({
                  error: "Failed to fetch emails",
                  message: error.message,
                  success: false,
            })
      }
}

// Get full email details by ID
exports.getEmailById = async (req, res, next) => {
      try {
            const { id } = req.params

            if (!id) {
                  return res.status(400).json({
                        error: "Email ID is required",
                        success: false,
                  })
            }

            console.log(`Fetching email details for ID: ${id}`)

            // First check in our local storage
            let email = receivedEmails.find((email) => email.uuid === id || email.messageId === id)

            if (!email) {
                  // If not found locally, try to fetch from Brevo API
                  try {
                        const response = await fetch(`https://api.brevo.com/v3/smtp/emails/${id}`, {
                              method: "GET",
                              headers: {
                                    "api-key":
                                          process.env.BREVO_API_KEY ||
                                          "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",
                                    accept: "application/json",
                              },
                        })

                        if (response.ok) {
                              const emailData = await response.json()
                              email = {
                                    ...emailData,
                                    text: emailData.textContent || emailData.text || "No message content available",
                                    htmlContent: emailData.htmlContent || "",
                                    isRead: true, // Mark as read when viewed
                                    isStarred: false,
                                    attachments: emailData.attachments || [],
                                    uuid: emailData.uuid || emailData.messageId || id,
                              }
                        }
                  } catch (fetchError) {
                        console.error("Error fetching email from API:", fetchError)
                  }
            }

            if (!email) {
                  return res.status(404).json({
                        error: "Email not found",
                        success: false,
                  })
            }

            // Mark email as read in local storage
            if (email.uuid || email.messageId) {
                  const emailIndex = receivedEmails.findIndex(
                        (e) => e.uuid === (email.uuid || email.messageId) || e.messageId === (email.uuid || email.messageId),
                  )
                  if (emailIndex !== -1) {
                        receivedEmails[emailIndex].isRead = true
                  }
            }

            res.json({
                  email,
                  success: true,
            })
      } catch (error) {
            console.error("Error fetching email details:", error)
            res.status(500).json({
                  error: "Failed to fetch email details",
                  message: error.message,
                  success: false,
            })
      }
}

// Enhanced email sending with better validation and response
exports.sendMail = async (req, res, next) => {
      try {
            const { to, subject, text, cc, bcc, htmlContent } = req.body

            // Validation
            if (!to || !subject || (!text && !htmlContent)) {
                  return res.status(400).json({
                        error: "Missing required fields: to, subject, and either text or htmlContent are required",
                        success: false,
                  })
            }

            // Email validation regex
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(to)) {
                  return res.status(400).json({
                        error: "Invalid email address format",
                        success: false,
                  })
            }

            console.log(`Sending email to: ${to}`)

            const emailPayload = {
                  sender: {
                        email: process.env.SENDER_EMAIL || "info@brightfuturesoft.com",
                        name: process.env.SENDER_NAME || "Bright Future Soft",
                  },
                  to: [{ email: to }],
                  subject,
            }

            // Add content based on what's provided
            if (text) {
                  emailPayload.textContent = text
            }
            if (htmlContent) {
                  emailPayload.htmlContent = htmlContent
            } else if (text) {
                  // Convert plain text to basic HTML
                  emailPayload.htmlContent = `<p>${text.replace(/\n/g, "<br>")}</p>`
            }

            // Add CC and BCC if provided
            if (cc) {
                  emailPayload.cc = cc.split(",").map((email) => ({ email: email.trim() }))
            }
            if (bcc) {
                  emailPayload.bcc = bcc.split(",").map((email) => ({ email: email.trim() }))
            }

            const response = await fetch("https://api.brevo.com/v3/smtp/email", {
                  method: "POST",
                  headers: {
                        "api-key":
                              process.env.BREVO_API_KEY ||
                              "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",
                        accept: "application/json",
                        "content-type": "application/json",
                  },
                  body: JSON.stringify(emailPayload),
            })

            if (!response.ok) {
                  const errorData = await response.json().catch(() => ({}))
                  console.error("Send email error:", response.status, errorData)
                  throw new Error(`Failed to send email: ${response.status} - ${errorData.message || "Unknown error"}`)
            }

            const result = await response.json()
            console.log("Email sent successfully:", result.messageId)

            // Store sent email for tracking
            const sentEmail = {
                  to,
                  subject,
                  text,
                  htmlContent,
                  cc,
                  bcc,
                  date: new Date().toISOString(),
                  messageId: result.messageId,
                  status: "sent",
                  uuid: `sent_${result.messageId || Date.now()}`,
                  from: process.env.SENDER_EMAIL || "info@brightfuturesoft.com",
            }

            sentEmails.push(sentEmail)

            res.json({
                  success: true,
                  result,
                  message: "Email sent successfully",
                  sentEmail,
            })
      } catch (error) {
            console.error("Error sending email:", error)
            res.status(500).json({
                  error: "Failed to send email",
                  message: error.message,
                  success: false,
            })
      }
}

// Get sent emails
exports.getSentMail = async (req, res, next) => {
      try {
            res.json({
                  emails: sentEmails,
                  total: sentEmails.length,
                  success: true,
            })
      } catch (error) {
            console.error("Error fetching sent emails:", error)
            res.status(500).json({
                  error: "Failed to fetch sent emails",
                  message: error.message,
                  success: false,
            })
      }
}

// Mark email as read
exports.markAsRead = async (req, res, next) => {
      try {
            const { id } = req.params

            // Find and update email read status
            const emailIndex = receivedEmails.findIndex((email) => email.uuid === id || email.messageId === id)

            if (emailIndex === -1) {
                  return res.status(404).json({
                        error: "Email not found",
                        success: false,
                  })
            }

            receivedEmails[emailIndex].isRead = true

            res.json({
                  success: true,
                  message: "Email marked as read",
            })
      } catch (error) {
            console.error("Error marking email as read:", error)
            res.status(500).json({
                  error: "Failed to mark email as read",
                  message: error.message,
                  success: false,
            })
      }
}

// Mark email as starred
exports.toggleStar = async (req, res, next) => {
      try {
            const { id } = req.params

            // Find and update email starred status
            const emailIndex = receivedEmails.findIndex((email) => email.uuid === id || email.messageId === id)

            if (emailIndex === -1) {
                  return res.status(404).json({
                        error: "Email not found",
                        success: false,
                  })
            }

            receivedEmails[emailIndex].isStarred = !receivedEmails[emailIndex].isStarred

            res.json({
                  success: true,
                  message: `Email ${receivedEmails[emailIndex].isStarred ? "starred" : "unstarred"}`,
                  isStarred: receivedEmails[emailIndex].isStarred,
            })
      } catch (error) {
            console.error("Error toggling star:", error)
            res.status(500).json({
                  error: "Failed to toggle star",
                  message: error.message,
                  success: false,
            })
      }
}

// Search emails
exports.searchEmails = async (req, res, next) => {
      try {
            const { query, email } = req.query

            if (!query) {
                  return res.status(400).json({
                        error: "Search query is required",
                        success: false,
                  })
            }

            const searchTerm = query.toLowerCase()

            // Search in received emails
            const filteredEmails = receivedEmails.filter(
                  (email) =>
                        email.subject?.toLowerCase().includes(searchTerm) ||
                        email.text?.toLowerCase().includes(searchTerm) ||
                        email.from?.toLowerCase().includes(searchTerm) ||
                        email.to?.toLowerCase().includes(searchTerm),
            )

            res.json({
                  emails: filteredEmails,
                  total: filteredEmails.length,
                  query: query,
                  success: true,
            })
      } catch (error) {
            console.error("Error searching emails:", error)
            res.status(500).json({
                  error: "Failed to search emails",
                  message: error.message,
                  success: false,
            })
      }
}

// Get email statistics
exports.getEmailStats = async (req, res, next) => {
      try {
            const totalEmails = receivedEmails.length
            const unreadEmails = receivedEmails.filter((email) => !email.isRead).length
            const starredEmails = receivedEmails.filter((email) => email.isStarred).length
            const totalSent = sentEmails.length

            res.json({
                  stats: {
                        total: totalEmails,
                        unread: unreadEmails,
                        starred: starredEmails,
                        sent: totalSent,
                  },
                  success: true,
            })
      } catch (error) {
            console.error("Error fetching email stats:", error)
            res.status(500).json({
                  error: "Failed to fetch email statistics",
                  message: error.message,
                  success: false,
            })
      }
}
