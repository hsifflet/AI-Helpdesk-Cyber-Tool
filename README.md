# IT Ticketing System

A Dockerized capstone project for an internal IT helpdesk ticketing system.

## Run the app

```bash
./start.sh
```

Or run Docker Compose directly:

```bash
docker compose up --build
```

## Local URLs

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api
- Health check: http://localhost:4000/health

## Stack

- React + Vite frontend
- Express API backend
- PostgreSQL database
- Docker Compose orchestration

## Current features

- Employee service desk with a simple home view for opening and tracking requests
- New request form with title, requester, employee number, workstation number, queue, priority, and description
- IT help desk workspace organized around Open queue, Closed, Networking, Cyber, Techroom, and Pickup
- Searchable help desk ticket table with status and critical-ticket filters
- Ticket metrics for open, critical, assigned, and resolved work
- Full-screen ticket detail view with requester, workstation, queue, due date, status, priority, and assignment controls
- Ticket comments/activity timeline stored in PostgreSQL
- Working navigation pages for users, assets, settings, employee requests, and help desk operations
- Seeded sample ticket data for local development

## Security features

- Bcrypt password hashing with a work factor of 12
- Email validation, 20-character email limit, and password rules enforced on both client and server
- New and reset passwords require 8-12 characters and allow only letters, numbers, and `! @ # $ % ^ & *`
- Parameterized PostgreSQL queries to reduce SQL injection risk
- `express-session` sessions stored in PostgreSQL rather than process memory
- `httpOnly`, `sameSite=lax`, production `secure`, and eight-hour session cookies
- Session-bound CSRF tokens required for state-changing requests
- Helmet security headers
- CORS restricted to the configured frontend origin
- Login and signup rate limiting of 10 attempts per 15 minutes
- 100 KB JSON request-body limit
- Random, 15-minute password reset tokens
- Generic login failure messages and non-enumerating forgot-password responses
- Authentication required for ticket, metric, comment, and session endpoints
- Input validation for required ticket fields and comment length
- Generic server error responses that avoid exposing internal details

## Authentication notes

Ticket and metric endpoints require a signed-in user. The forgot-password flow returns a reset code in the local development response because this capstone project does not yet send email. In a production deployment, that code should be delivered through a verified email provider instead. Set a strong, private `SESSION_SECRET` and run behind HTTPS with `NODE_ENV=production` before deploying publicly.

## Data model

The API creates these PostgreSQL tables on startup:

- `users`: account email, bcrypt password hash, role, and creation time
- `tickets`: request details, queue/category, status, priority, requester, employee/workstation numbers, assignment, due date, and timestamps
- `ticket_comments`: ticket activity, author, comment body, and timestamp
- `user_sessions`: PostgreSQL-backed login sessions created by `connect-pg-simple`

Ticket data is persisted in the Docker volume `ticket_db_data`. The local application does not impose a fixed ticket count; practical capacity depends on the disk and resources available to Docker/PostgreSQL.
