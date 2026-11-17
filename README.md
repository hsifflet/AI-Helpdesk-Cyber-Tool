# IT Ticketing System

A Dockerized capstone project for an internal IT helpdesk ticketing system with an AI agent. Employees get a simple self-service front door (including an AI troubleshooting chat), and technicians get the full help desk console.

## Run the app

1. Copy the example settings file and fill it in:

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `PUBLIC_IP` | Address the browser uses to reach the app (`localhost` locally, or the server's Elastic IP when deployed) |
| `POSTGRES_PASSWORD` | Database password |
| `SESSION_SECRET` | Long random string used to sign login sessions |

2. Start everything:

```bash
./start.sh
```

Or run Docker Compose directly:

```bash
docker compose up --build
```

The `.env` file is ignored by git and must never be committed. Each environment keeps its own copy.

## URLs

- Frontend: http://localhost:5173 (deployed: `http://<server-ip>:5173`)
- Backend API: http://localhost:4000/api (deployed: `http://<server-ip>:4000/api`)
- Health check: http://localhost:4000/health

When deployed on AWS EC2, the security group must allow inbound TCP 5173 and 4000.

## Stack

- React + Vite frontend
- Express API backend
- PostgreSQL database
- Docker Compose orchestration
- AI agent powered by Claude on Amazon Bedrock (mock mode for local development)
- Hosted on AWS EC2

## Roles

- **Employee** (default for every new account): My Service Desk and Ask the Agent. Employees see only their own tickets.
- **Technician (`tech`)**: everything employees have, plus New Request, Help Desk, Users, and Assets. Technicians see all tickets and can manage users.

New accounts are always created as employees. A technician promotes or demotes other accounts from the **Users** page. A technician cannot change their own role, so the last technician can't be locked out by accident.

To create the very first technician, promote an account directly in the database:

```bash
docker compose exec db psql -U ticket_admin -d tickets -c "UPDATE users SET role = 'tech' WHERE email = 'you@example.com';"
```

## Current features

- Employee service desk showing the signed-in user's own requests
- **Ask the Agent**: employees choose between an AI troubleshooting chat or submitting a ticket directly
- AI chat that searches past resolved tickets for fixes, shows the user's own tickets, and can open a ticket after confirming the details with the user
- New request form with title, requester, employee number, workstation number, queue, priority, and description
- IT help desk workspace (technicians) organized around Open queue, Closed, Networking, Cyber, Techroom, and Pickup
- Searchable help desk ticket table with status and critical-ticket filters
- Ticket metrics for open, critical, assigned, and resolved work (employees see counts for their own tickets only)
- Full-screen ticket detail view with requester, workstation, queue, due date, and comments; status, priority, and assignment controls are technician-only
- Technician AI agent panel on each ticket that searches similar past tickets and suggests next steps
- Ticket comments/activity timeline stored in PostgreSQL
- Users page (technicians): view all accounts and promote or demote technicians
- Settings page with sign out; Assets page is currently a placeholder
- Seeded sample tickets and demo resolved tickets for local development

## AI agent

The agent runs in one of two modes, set by the `AI_PROVIDER` environment variable on the API service:

- `mock` (default): no AI model needed. The chat reads back matching fixes from resolved tickets, which is useful for local development and testing.
- `bedrock`: uses Claude on Amazon Bedrock through the server's IAM role (no API key stored). Requires Bedrock model access enabled in the AWS account and an IAM role on the server that is allowed to call Bedrock. `AWS_REGION` and `BEDROCK_MODEL_ID` can be set to override the defaults.

The employee chat
