# Bright Future Soft API

Express + MongoDB backend (`index.js`).

- Base URL (local): `https://sever.brightfuturesoft.com`
- Base URL (prod): `https://brightfuturesoft.com` origins are allowed by CORS; check `vercel.json` for the API host.
- Prefix: `/api/v1` (images also at `/api/v2/image`)
- Health check: `GET /api/v1/`
- Body format: JSON (`Content-Type: application/json`). Gmail send accepts up to 30 MB (base64 attachments). Image upload is `multipart/form-data`.
- CORS: allowed origins are `https://brightfuturesoft.com`, `https://www.brightfuturesoft.com`, `http://localhost:5173`.

## Authentication

Three access levels. The "Auth" column in each table uses these names.

| Auth | How | Middleware |
|---|---|---|
| `public` | none | - |
| `author` | header `author: bright_future_soft` (static shared key, not per-user) | `Middleware/PostRequset.js` |
| `jwt` | header `Authorization: Bearer <token>`; token comes from `POST /auth/sign-in` | `authenticate` in `Middleware/admin_only.js` |
| `admin` | `jwt` plus user `designation` is `Chief Executive Officer` or `manager` | `admin_only` |

## Response format

Success:

```json
{ "success": true, "message": "...", "data": {}, "request_time": 1730000000000 }
```

Failure:

```json
{ "success": false, "message": "...", "request_time": 1730000000000 }
```

| Status | Meaning |
|---|---|
| 400 | Validation failed / missing field |
| 401 | `jwt`: missing, invalid or expired token, or bad credentials |
| 403 | `admin`: user is not admin |
| 404 | Unknown route (`API Not Found`) or missing record |
| 410 | Job application deadline passed |
| 500 | Unhandled error (`Global Error Handler`) |

Note: `author` failures return HTTP 200 with `{ "success": false, "message": "Unauthorized" }`, not 401.

Most "by id" endpoints take the Mongo `_id` as a **query parameter** (name listed per endpoint), not a path parameter.

---

## Auth — `/api/v1/auth`

| Method | Path | Auth | Input | Notes |
|---|---|---|---|---|
| POST | `/sign-up` | public | body: `name`, `email`, `password`, `designation`, `image` | Creates user |
| POST | `/sign-in` | author | body: `email`, `password` | Returns JWT |
| POST | `/forget-password` | public | body: `email` | Sends reset email |
| POST | `/reset-password` | public | query: `token`; body: `password` | |
| GET | `/all` | author | query: `email` (optional filter) | List users |
| PUT | `/update-user-data` | author | query: `user_id`; body: `phone`, `linkedin`, `dob`, `name`, `designation`, `image` | |
| PUT | `/update-user-password` | author | query: `user_id`; body: `old_password`, `new_password` | |
| DELETE | `/delete/:id` | author | path: `id` | |

Sign-in example:

```bash
curl -X POST https://sever.brightfuturesoft.com/api/v1/auth/sign-in \
  -H 'Content-Type: application/json' -H 'author: bright_future_soft' \
  -d '{"email":"a@b.com","password":"secret"}'
```

## Blog — `/api/v1/blog`

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/get-blog` | public | - |
| GET | `/get-blog-by-id` | public | query: `blog_id` |
| POST | `/add-blog` | author | body: blog document |
| PUT | `/update-blog` | author | query: `blog_id`; body: fields to update |
| DELETE | `/delete-blog` | author | query: `blog_id` |

## Project (portfolio) — `/api/v1/project`

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/get-project` | public | - |
| GET | `/get-project-by-id` | public | query: `project_id` |
| POST | `/add-project` | author | body: project document |
| PUT | `/update-blog` | author | query: `project_id`; body: fields to update |
| DELETE | `/delete-blog` | author | query: `project_id` |

The project update/delete paths are named `update-blog` / `delete-blog` in `Routers/project_router.js` (copy-paste naming). Documented as implemented.

## Jobs — `/api/v1/job-post`

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/all-job` | public | - |
| GET | `/get-job-by-id` | public | query: `job_post_id` |
| POST | `/add-job` | author | body: job document (includes `dateline`) |
| PUT | `/update-job` | author | query: `job_post_id`; body |
| DELETE | `/delete-job` | author | query: `job_post_id` |
| POST | `/apply-job` | public | body: `job_post_id`, `full_name`, `email_address`, `resume` (required) plus other application fields; 410 if deadline passed |
| GET | `/get-job-apply` | public | query: any filter fields |
| PUT | `/update-job-apply` | author | query: `job_apply_id`; body |
| DELETE | `/delete-job-apply` | author | query: `job_apply_id` |

## Issues — `/api/v1/issue`

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/get-issue-by-id` | public | query: `issue_id` |
| GET | `/get-issue` | author | query: `author_name` |
| POST | `/add-issue` | author | body: `author_name`*, `subject`*, `status`*, `body`*, `issue_date` (number). No other keys allowed. `issue_number` is auto-incremented. |
| PUT | `/update-issue` | author | query: `issue_id`; body |
| DELETE | `/delete-issue` | author | query: `issue_id` |

## Notices — `/api/v1/notice`

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/get-notice` | public | - |
| GET | `/get-notice-by-id` | public | query: `notice_id` |
| POST | `/add-notice` | author | body: `subject`*, `body`*, `notice_date` (number). No other keys allowed. |
| DELETE | `/delete-notice` | author | query: `notice_id` |

## Meetings — `/api/v1/meeting`

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/get-meetings` | public | query: `email` (optional) |
| POST | `/add-meeting` | author | body: `title`, `agenda`, `date`, `duration`, `link`, `selectedUsers[]` (each with `email`). Emails an invite to each user. |
| PUT | `/edit-meeting` | author | query: `meeting_id`; body |
| DELETE | `/delete-meeting` | author | query: `meeting_id` |
| GET | `/get-client-meeting` | public | - |
| POST | `/add-client-meeting` | author | body: meeting document |
| PUT | `/edit-client-meeting` | author | query: `client_meeting_id`; body |
| DELETE | `/delete-client-meeting` | author | query: `client_meeting_id` |

## Tasks — `/api/v1/task`

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/get-task` | public | - |
| GET | `/get-task-by-id` | public | see note |
| GET | `/get-task-by-assignedTo` | public | see note |
| POST | `/add-task` | author | body: task document |
| PUT | `/update-task` | author | query: `id`; body |
| DELETE | `/delete-task` | author | query: `id` |

Note: `get_task_by_id` and `get_task_by_assignedTo` read `req.params.id` / `req.params.assignedTo`, but the routes define no path params, so both values are `undefined` as routed. Fix the router (`/get-task-by-id/:id`, `/get-task-by-assignedTo/:assignedTo`) before relying on these.

## Contact — `/api/v1/contact`

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/get-contacts` | public | - |
| POST | `/add-contact` | public | body: `full_name`*, `email_or_phone`*, `message`*, `time_stamp`* |
| PUT | `/update-contact` | author | query: `contact_id`; body |
| DELETE | `/delete-contact` | author | query: `contact_id` |

## Subscribers — `/api/v1/subscriber`

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/get-subscribers` | author | - |
| POST | `/add-subscriber` | public | body: subscriber document (e.g. `email`) |
| PUT | `/update-subscriber` | author | query: `subscriber_id`; body |
| DELETE | `/delete-subscriber` | author | query: `subscriber_id` |

## Images — `/api/v1/image`, `/api/v2/image`

| Method | Path | Auth | Input |
|---|---|---|---|
| POST | `/api/v1/image/upload-image` | public | multipart: `image` (file; image or PDF), `title` (optional). Stored in cloud folder `bright_future_soft`. |
| GET | `/api/v1/image/:id` | public | path: `id` |
| GET | `/api/v1/image/blur/:id` | public | path: `id` (blurred version) |
| GET | `/api/v2/image/:id` | public | path: `id` |

Upload has no auth. Consider protecting it.

## Mail (legacy inbox) — `/api/v1/mail`

All routes require `author`.

| Method | Path | Input |
|---|---|---|
| GET | `/get-all-mail` | query: `email` |
| GET | `/email/:id` | path: `id` |
| POST | `/send-mail` | body: `to`, `subject`, `text`, `cc`, `bcc`, `htmlContent` |
| GET | `/sent-mail` | - |
| PUT | `/email/:id/read` | path: `id` |
| PUT | `/email/:id/star` | path: `id` |
| GET | `/search` | query: `query`, `email` |
| GET | `/stats` | - |
| POST | `/send-mail/candidate` | body: `sender`, `to`, `subject`, `htmlContent`, `textContent` |

## Gmail — `/api/v1/mail/gmail`

Each employee links their own Google mailbox. All routes need `jwt` except `/callback`.

| Method | Path | Auth | Input |
|---|---|---|---|
| GET | `/callback` | public | query: `code`, `state`, `error` (Google redirect target) |
| GET | `/status` | jwt | - |
| GET | `/auth-url` | jwt | query: `popup=1` (optional) |
| DELETE | `/disconnect` | jwt | - |
| GET | `/settings` | jwt | - |
| PUT | `/settings` | jwt | body: mail settings (e.g. `resendKey`) |
| DELETE | `/settings` | jwt | - |
| GET | `/unread` | jwt | query: `q`, `pageToken` |
| POST | `/batch` | jwt | body: `ids[]`, `read`, `starred`, `trash` |
| POST | `/mark-all-read` | jwt | body: `folder` (default `inbox`) |
| GET | `/messages` | jwt | query: `folder` (default `inbox`), `q`, `pageToken`, `unread` |
| GET | `/messages/:id` | jwt | path: `id` |
| GET | `/messages/:id/attachments/:attId` | jwt | query: `name` (download filename) |
| POST | `/messages` | jwt | body: `to`, `cc`, `bcc`, `subject`, `html`, `text`, `threadId`, `inReplyTo`, `references`, `attachments[]` (base64) |
| PUT | `/messages/:id` | jwt | body: `read`, `starred` |
| DELETE | `/messages/:id` | jwt | moves to trash |

## Accounts — `/api/v1/accounts`

`GET /my-payslips` needs `jwt` (own payslips only). Everything else needs `admin`.

### Clients

| Method | Path | Input |
|---|---|---|
| GET | `/clients` | - |
| POST | `/clients` | body: `name`*, `company`, `email`, `phone`, `address`, `notes` |
| PUT | `/clients/:id` | body: same keys |
| DELETE | `/clients/:id` | - |

### Invoices

| Method | Path | Input |
|---|---|---|
| GET | `/invoices` | query: `clientId`, `kind`, `status` |
| GET | `/invoices/:id` | - |
| POST | `/invoices` | body: invoice fields (see `INVOICE_KEYS` in `Modules/accounts_module.js`) |
| PUT | `/invoices/:id` | body: invoice fields |
| DELETE | `/invoices/:id` | - |
| POST | `/invoices/:id/cancel` | - |
| POST | `/invoices/:id/restore` | - |
| POST | `/invoices/:id/payments` | body: `amount`, `date`, `method`, `type`, `note`. Rejected if amount exceeds balance. |
| DELETE | `/invoices/:id/payments/:paymentId` | - |

### Payroll

| Method | Path | Input |
|---|---|---|
| GET | `/employees` | - |
| GET | `/salary-profiles` | - |
| PUT | `/salary-profiles/:employeeId` | body: `basic`, `allowances`, `bankAccount`, `joiningDate`, `pf` |
| GET | `/payslips` | query: `month`, `employeeId`, `status` |
| POST | `/payslips/generate` | body: `month` (bulk generate) |
| POST | `/payslips` | body: `employeeId`, `month`, `earnings`, `deductions`, `workingDays`, `absentDays`, `extraHours`, `notes`, `pf` |
| PUT | `/payslips/:id` | body: `earnings`, `deductions`, `workingDays`, `absentDays`, `extraHours`, `notes`, `pf` |
| DELETE | `/payslips/:id` | - |
| POST | `/payslips/:id/payments` | body: payment (same keys as invoice payment) |
| DELETE | `/payslips/:id/payments/:paymentId` | - |
| GET | `/provident-fund` | - |
| GET | `/my-payslips` | `jwt` only |

### Expenses and reports

| Method | Path | Input |
|---|---|---|
| GET | `/expenses` | - |
| POST | `/expenses` | body: `title`*, `amount`*, `category`, `date` (default today), `vendor`, `method`, `notes` |
| PUT | `/expenses/:id` | body: same keys |
| DELETE | `/expenses/:id` | - |
| GET | `/reports/summary` | query: `year` (default current year) |

---

## Known issues found while documenting

1. `author` key `bright_future_soft` is a static shared secret; anyone with the frontend bundle has it.
2. `JWT_SECRET` is hardcoded as `'your_jwt_secret_key'` in `Middleware/admin_only.js`. Move to `.env`.
3. `POST /image/upload-image` has no auth.
4. Task get-by-id / assignedTo routes lack path params (see Tasks).
5. Project update/delete are mounted at `/update-blog` and `/delete-blog`.
6. `documentation.html` is stale (wrong port 5001, old auth header). Replace or remove.
7. Run on Node 24 or lower: `buffer-equal-constant-time` crashes on Node 25+ (`SlowBuffer` removed).
