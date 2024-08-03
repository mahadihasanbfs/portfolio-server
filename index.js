const express = require('express');
const app = express();
const path = require('path');
const port = 5010;
const cors = require('cors');

const blogRouter = require('./Routers/blog_router');
const imageRouter = require('./Routers/image_router');
const auth_router = require('./Routers/auth_router');
const job_router = require('./Routers/job_router');
const issue_router = require('./Routers/issue_router');
const notice_router = require('./Routers/notice_router');
const meeting_router = require('./Routers/meeting_router');
const project_router = require('./Routers/project_router');

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

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

app.listen(port, () => {
    console.log(`Server is listening on http://localhost:${port}`);
});
