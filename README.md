# Healthcare AI Receptionist — Apollo Hospitals Chennai

An AI-powered healthcare receptionist built with **Next.js**, **Express**, **Prisma**, and **Bolna Voice AI**. Patients can call in and naturally converse with the AI to book appointments, get doctor information, and manage their healthcare needs.

## Architecture

```
Frontend (Next.js 16)  ──── REST API ──── Backend (Express) ──── Prisma ──── SQLite/PostgreSQL
                                                                     │
                                                              Bolna Webhooks (future)
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, Tailwind CSS v4, TypeScript |
| Backend | Express.js, Prisma ORM |
| Database | SQLite (dev) / PostgreSQL (production) |
| Voice AI | Bolna (configured via webhooks) |

## Project Structure

```
healthcare-ai-assignment/
├── backend/          # Express API server
│   ├── prisma/       # Schema + seed data
│   └── src/routes/   # API route handlers
├── frontend/         # Next.js app
│   └── src/app/      # Pages (home, dashboard, appointments, voice-demo, evaluation)
├── scraper/          # Apollo Hospitals data scraper
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### 1. Setup Backend

```bash
cd backend
npm install
npx prisma db push    # Creates SQLite database
npm run db:seed       # Seeds Apollo Chennai data
npm run dev           # Starts on http://localhost:4000
```

### 2. Setup Frontend

```bash
cd frontend
npm install
npm run dev           # Starts on http://localhost:3000
```

### 3. Open the App

Visit **http://localhost:3000** to use the application.

## API Endpoints

### Doctors
- `GET /api/doctors` — List doctors (filters: `?specialty=`, `?branch=`)
- `GET /api/doctors/:id` — Doctor details

### Departments
- `GET /api/departments` — List departments
- `GET /api/departments/:id` — Department with doctors

### Patients
- `GET /api/patients/search?phone=` — Find patient by phone
- `POST /api/patients` — Create patient

### Appointments
- `GET /api/appointments` — List (filters: `?phone=`, `?date=`, `?status=`)
- `GET /api/appointments/slots?doctorId=&date=` — Available slots
- `POST /api/appointments` — Create
- `PATCH /api/appointments/:id/reschedule` — Reschedule
- `PATCH /api/appointments/:id/cancel` — Cancel
- `PATCH /api/appointments/:id/status` — Update status

### Dashboard
- `GET /api/dashboard/stats` — Overview statistics
- `GET /api/dashboard/recent` — Recent activity

### Callbacks
- `GET /api/callbacks` — List follow-ups
- `POST /api/callbacks` — Create follow-up request
- `PATCH /api/callbacks/:id` — Update follow-up

### Webhooks (Bolna)
- `POST /api/webhooks/bolna/call-started`
- `POST /api/webhooks/bolna/call-completed`
- `POST /api/webhooks/bolna/booking`

### Evaluations
- `GET /api/evaluations/scenarios` — List test scenarios
- `GET /api/evaluations/results` — Test results
- `POST /api/evaluations/run` — Run a test scenario

## Seed Data

The database is pre-seeded with Apollo Hospitals Chennai data:

- **4 branches** — Greams Road, Teynampet, Velachery, OMR Road
- **10 departments** — Cardiology, Orthopedics, Dermatology, Pediatrics, etc.
- **21 doctors** — With realistic specialties, experience, and consultation fees
- **10 sample patients** — With appointment history
- **6 sample appointments** — Various statuses
- **5 sample call logs** — With conversation summaries
- **FAQ data** — 10 common hospital FAQs

## Bolna Integration (Future)

To connect Bolna Voice AI:

1. Create a Bolna agent at [bolna.ai](https://bolna.ai)
2. Configure the knowledge base with doctor and department data
3. Register function tools pointing to the backend APIs
4. Set up webhooks to receive call events
5. Update the AI prompt with the conversation flow guidelines

See the API documentation for webhook payload formats.

## Deployment

### Backend (Render)

Create a `render.yaml` in the backend directory:

```yaml
services:
  - type: web
    name: healthcare-ai-backend
    env: node
    buildCommand: npm install && npx prisma generate
    startCommand: npm run start
    envVars:
      - key: DATABASE_URL
        value: postgresql://...
      - key: NODE_ENV
        value: production
```

### Frontend (Vercel)

```bash
cd frontend
npm run build
```

Set `NEXT_PUBLIC_API_URL` to your backend URL in Vercel environment variables.
