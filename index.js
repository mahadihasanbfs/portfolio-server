const express = require('express');
const app = express();
const path = require('path');
const port = 5010;
const cors = require('cors');


const blogRouter = require('./Routers/blog_router');
const imageRouter = require('./Routers/image_router');
const imageRouter2 = require('./Routers/image_v2');
const auth_router = require('./Routers/auth_router');
const job_router = require('./Routers/job_router');
const issue_router = require('./Routers/issue_router');
const notice_router = require('./Routers/notice_router');
const meeting_router = require('./Routers/meeting_router');
const project_router = require('./Routers/project_router');
const subcriber_router = require('./Routers/subcriber_router');
const contact_router = require('./Routers/contact_router');
const task_router = require('./Routers/task_router');
const mail_router = require('./Routers/mail_router');
const accounts_router = require('./Routers/accounts_router');
const gmail_router = require('./Routers/gmail_router');
const attendance_router = require('./Routers/attendance_router');
const bank_router = require('./Routers/bank_router');
const employee_router = require('./Routers/employee_router');
const access_router = require('./Routers/access_router');
const sales_router = require('./Routers/sales_router');
const discord_router = require('./Routers/discord_router');
const discord = require('./Modules/discord_module');
const docs_auth = require('./Middleware/docs_auth');

const allowedOrigins = [
  "https://brightfuturesoft.com",
  "https://www.brightfuturesoft.com",
  "http://localhost:5173",
  "http://localhost:5010",

];

// Same-origin requests (the docs page calling its own server) are always allowed; other origins must be listed.
const corsOptions = (req, callback) => {
  const origin = req.header('Origin');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const self = `${proto}://${req.get('host')}`;
  const allowed = !origin || origin === self || allowedOrigins.includes(origin);
  callback(allowed ? null : new Error("Not allowed by CORS"), {
    origin: allowed,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "author"]
  });
};
app.use(cors(corsOptions));

app.options("*", cors());


// Mail with attachments is base64 in JSON: raise the limit for this route only (must come before the global parser).
app.use('/api/v1/mail/gmail', express.json({ limit: '30mb' }));
// Blog posts carry long HTML (and inline base64 images from the editor): the 100kb default rejects them.
app.use('/api/v1/blog', express.json({ limit: '50mb' }));
app.use(express.json());

// API reference: login page until signed in, then the docs.
app.get("/", docs_auth.page);
app.post("/docs/login", docs_auth.login);
app.post("/docs/logout", docs_auth.logout);

// API version 1 routes
app.get("/api/v1/", (req, res) => {
      res.send({
            success: true,
            message: 'API is up and running',
            request_time: new Date().getTime()
      });
});

// API routes
app.use('/api/v1/blog', blogRouter);
app.use('/api/v1/image', imageRouter);
app.use('/api/v1/auth', auth_router);
app.use('/api/v1/job-post', job_router);
app.use('/api/v1/issue', issue_router);
app.use('/api/v1/notice', notice_router);
app.use('/api/v1/meeting', meeting_router);
app.use('/api/v1/project', project_router);
app.use('/api/v1/subscriber', subcriber_router);
app.use('/api/v1/contact', contact_router);
app.use('/api/v1/task', task_router);
app.use('/api/v1/mail/gmail', gmail_router);
app.use('/api/v1/mail', mail_router);
app.use('/api/v1/accounts', accounts_router);
app.use('/api/v1/attendance', attendance_router);
app.use('/api/v1/bank', bank_router);
app.use('/api/v1/employees', employee_router);
app.use('/api/v1/access', access_router);
app.use('/api/v1/sales', sales_router);
app.use('/api/v1/discord', discord_router);
app.use('/api/v2/image', imageRouter2);


// Error Handling Middleware
app.use((req, res, next) => {
      res.status(404).json({
            success: false,
            message: 'API Not Found',
            errorMessages: [
                  {
                        path: req.originalUrl,
                        message: 'Endpoint Not Found',
                  },
            ],
            request_no: new Date().getTime()
      });
});

app.use((err, req, res, next) => {
      console.error('Global Error Handler: ', err);

      const status = err.status || 500;
      const message = err.message || 'An error occurred';
      const errors = err.errors ? err.errors : [{ message }];

      res.status(status).json({
            success: false,
            message,
            errors,
            request_no: new Date().getTime()
      });
});

// On a normal server, check every minute whether today's Discord report is due. On Vercel the cron route does this instead.
if (!process.env.VERCEL) {
  setInterval(() => { discord.send_daily().catch((e) => console.error('Discord daily report failed:', e.message)); }, 60 * 1000);
}

app.listen(port, () => {
      console.log(`Server is listening on http://localhost:${port}`);
});
