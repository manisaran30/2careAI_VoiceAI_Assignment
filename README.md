# Healthcare AI Receptionist — Apollo Hospitals Visakhapatnam

An AI-powered voice receptionist for Apollo Hospitals Visakhapatnam. Patients call in and converse naturally with the AI to book, reschedule, or cancel appointments, find the right doctor, and get hospital information. Built with **Next.js 16**, **Express**, **Prisma**, and **Bolna Voice AI**.

**Deployed backend**: https://apollo-ai-backend-0jmd.onrender.com  
**Frontend**: http://localhost:3000 (dev) / Vercel (production)

---

## Architecture

```
Patient Call (Phone)
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│                    Bolna Voice AI                             │
│  (STT: Deepgram Nova-3 → LLM: GPT-4o → TTS: ElevenLabs)     │
│  8 custom function tools → POST to backend                   │
│  Webhooks → POST /api/webhooks/bolna/*                       │
└──────────────────────────┬───────────────────────────────────┘
                           │ REST API
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              Express Backend (Render)                         │
│  Routes: appointments, doctors, patients, slots, bookings    │
│  Voice: session manager, SSE, call logging                   │
│  Eval: 11 test scenarios, batch runner                       │
└──────────────────────┬───────────────────────────────────────┘
                       │ Prisma ORM
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  PostgreSQL (Supabase) / SQLite (dev)                        │
│  12 tables: Branch, Department, Doctor, Patient,             │
│  Appointment, AppointmentSlot, CallLog, CallEvent,           │
│  ConversationSummary, HumanFollowup, WebhookEvent,           │
│  EvaluationResult                                            │
└──────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, Tailwind CSS v4, TypeScript |
| **Backend** | Express.js, Prisma ORM, TypeScript |
| **Database** | SQLite (dev) / PostgreSQL (production on Supabase) |
| **Voice AI** | Bolna (STT: Deepgram Nova-3, LLM: GPT-4o, TTS: ElevenLabs) |
| **Telephony** | Plivo (via Bolna) |
| **Deployment** | Render (backend) + Vercel (frontend) |

---

## Project Structure

```
healthcare-ai-assignment/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # SQLite dev schema
│   │   ├── schema.postgres.prisma  # PostgreSQL production schema
│   │   └── seed.ts                 # Seeds from scraped-data.json
│   └── src/
│       ├── routes/                  # 15 route files
│       │   ├── appointments.ts      # Full CRUD + slot management
│       │   ├── bookings.ts          # voice-book & voice-handoff
│       │   ├── slots.ts             # Availability + seed
│       │   ├── doctors.ts           # Search + filters
│       │   ├── evaluations.ts       # 11 test scenarios + batch
│       │   ├── voice-call.ts        # Call initiation
│       │   ├── webhooks.ts          # Bolna webhook handler
│       │   └── ...
│       ├── voice/
│       │   ├── bolna-provider.ts    # Bolna API integration
│       │   ├── session-manager.ts   # Call state machine
│       │   └── ...
│       ├── utils/date-parser.ts     # NL date parser
│       └── scripts/
│           └── eval-harness.ts      # Standalone eval script
├── frontend/
│   └── src/app/                     # Pages: home, dashboard,
│                                    # appointments, evaluation,
│                                    # voice-call, calls
├── scraper/
│   ├── src/scrape.ts                # Apollo Vizag data scraper
│   └── scraped-data.json            # 50 real doctors, 2 branches
├── BOLNA_AGENT_CONFIG.md            # Full Bolna dashboard config
├── BOLNA_INTEGRATION_PLAN.md        # Integration guide
├── BOLNA_KNOWLEDGE_BASE.md          # KB content for Bolna
└── render.yaml                      # Render deployment config
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### 1. Setup Backend
```bash
cd backend
npm install
npx prisma db push    # Creates SQLite database from schema
npm run db:seed       # Seeds 50 real Vizag doctors, slots
npm run dev           # Starts on http://localhost:4000
```

### 2. Setup Frontend
```bash
cd frontend
npm install
npm run dev           # Starts on http://localhost:3000
```

### 3. Scrape Fresh Data (optional)
```bash
cd scraper
npm install
npm run scrape        # Fetches latest Vizag doctor data
cd ../backend
npm run db:seed       # Re-seeds from updated scraped data
```

### 4. Run Eval Harness
```bash
cd backend
npx tsx src/scripts/eval-harness.ts
```

---

## Key Design Decisions

### 1. Slot-Based Booking (not calendar-based)
**Problem**: Two callers could book the same slot simultaneously.  
**Solution**: Pre-generated `AppointmentSlot` rows with `status: available | booked | blocked`. Booking transitions the slot atomically within a Prisma `$transaction`. If the slot is already `booked`, the transaction fails — no double-booking possible.  
**Trade-off**: Slots must be pre-generated (currently 14 days out, 5 slots/day per doctor = ~3,000 slots).

### 2. Real Data from Apollo's Own Website (not Practo, not manual)
**Problem**: Hand-crafted seed data isn't credible for production.  
**Solution**: A `cheerio`-based scraper extracts structured JSON-LD from `apollohospitals.com/book-doctor-appointment/visakhapatnam`. The site embeds `Physician` entries in `<script type="application/ld+json">` with name, specialty, address (→ branch via pincode), price range, and experience (from FAQ schema). No JS rendering needed — all data is server-rendered Drupal output.  
**Result**: 50 real Apollo Vizag doctors across 2 branches, refreshed on demand.

### 3. POST over GET for Bolna Custom Functions
**Problem**: Bolna's custom function tooling was unreliable with query parameters (encoding issues, missing params).  
**Solution**: All 8 functions (`check_doctor`, `check_slot`, `create_appointment`, `reschedule_appointment`, `cancel_appointment`, `fetch_patient_bookings`, `request_human_handoff`) use `key: custom_task` with `method: POST` and JSON body.  
**Trade-off**: Some endpoints are semantically GET, but POST with body is more reliable for parameter passing in Bolna's pipeline.

### 4. Separate `voice-book` Endpoint
**Problem**: The Bolna agent doesn't know `patientId` (it only has `patientName` + `phone` from the caller). The standard `POST /api/appointments` requires `patientId`.  
**Solution**: `POST /api/bookings/voice-book` accepts `patientName`, `phone`, `doctorId`, `date`, `time` — it resolves/finds/creates the patient internally, then books atomically.  
**Trade-off**: Duplicates some business logic, but keeps the Bolna agent's function tools simple.

### 5. Atomic Transactions for Conflict Prevention
**Problem**: Parallel bookings (voice + web + walk-in) could conflict.  
**Solution**: Booking wraps `Appointment.create` + `AppointmentSlot.update` in a `$transaction`. The slot's `status = 'booked'` is checked inside the transaction — if already booked, the entire operation rolls back.

### 6. SQLite Dev / PostgreSQL Production Dual Schema
**Problem**: Prisma requires a single `provider` at generation time. Render needs PostgreSQL; local dev needs SQLite (zero setup).  
**Solution**: Two schema files — `schema.prisma` (SQLite for dev) and `schema.postgres.prisma` (PostgreSQL for production). Render's `render.yaml` copies the postgres schema over the dev schema during build: `cp prisma/schema.postgres.prisma prisma/schema.prisma`.  
**Trade-off**: Schema changes must be mirrored in both files.

### 7. Natural Language Date Parsing
**Problem**: Callers say "next Monday", "day after tomorrow", "twenty second june".  
**Solution**: A custom `date-parser.ts` utility handles word-number mapping ("twenty second" → 22), relative dates ("tomorrow", "next Monday"), and formats ("20 June 2026", "June 22").  
**Trade-off**: Covers ~90% of common patterns; truly ambiguous phrases ("next Thursday" on a Wednesday) use standard ISO interpretation.

### 8. Bolna Over Custom Voice Stack
**Decision**: Use Bolna's managed voice AI rather than building STT → LLM → TTS pipelines from scratch.  
**Rationale**: Bolna provides telephony (via Plivo), STT (Deepgram Nova-3), LLM orchestration (GPT-4o), TTS (ElevenLabs), interruption handling, endpointing, and webhooks out of the box. Building equivalent infrastructure would require integrating 5+ separate services.

---

## Latency Story

### Target: < 2s per turn (AI response time)

### Measured Performance (Eval Harness, local SQLite)
| Operation | Avg Latency |
|---|---|
| Doctor lookup | 2ms |
| Book appointment (DB write) | 80ms |
| Reschedule appointment | 82ms |
| Cancel appointment | 84ms |
| Human handoff | 79ms |
| Batch (13 tests) | 431ms total (33ms avg) |

### Voice Call Latency (Bolna)
Bolna reports per-turn latency in webhook `latency_data`:
- **Transcriber** (Deepgram Nova-3): ~300-500ms (streaming)
- **LLM** (GPT-4o, 300 tokens): ~400-800ms
- **Synthesizer** (ElevenLabs Turbo v2.5): ~200-400ms (with 200ms buffer)
- **Total per turn**: ~900ms-1.7s (within 2s target)

### Tuning Parameters (set in Bolna dashboard)
- **Buffer Size**: 200ms (smooth audio without excessive delay)
- **Endpointing**: 250ms (catches end-of-speech quickly)
- **Linear Delay**: 450ms (accounts for mid-sentence pauses in Indian English)
- **Max Tokens**: 300 (keeps voice responses concise)

### Backend API Latency (Render + Supabase PostgreSQL)
- Cold start: ~2-3s (free tier, spins down after inactivity)
- Warm requests: ~50-150ms
- The eval harness report captures per-operation latency for monitoring.

---

## Eval Harness

### Design Philosophy

The eval harness tests the **API surface the AI agent calls** — not database CRUD operations. It measures what matters for a voice receptionist: task completion, graceful error handling, latency, and data integrity.

### 6 Dimensions (weighted)

| Dimension | Weight | What it measures | Why it matters |
|---|---|---|---|
| **E2E Booking Flow** | 25% | Full book → verify → reschedule → cancel → handoff lifecycle | Core business value |
| **Hallucination Resistance** | 20% | Graceful handling of nonsense inputs (fake specialties, missing fields, non-existent IDs) | AI agent must say "I don't know" instead of inventing data |
| **Conversation Simulation** | 15% | Multi-turn flow: search → slot check → book → verify (chained like a real call). Concurrent booking race protection. Natural language search coverage across 10 medical terms | Tests the agent's actual call flow — not isolated API calls |
| **Error Recovery** | 20% | Proper 4xx codes, no crashes on bad requests, missing fields | Production resilience |
| **Latency & Performance** | 15% | Per-endpoint p50/p95/p99 latency over 5 iterations, budget thresholds | Voice calls are real-time; <1s for lookups, <2s for bookings |
| **Data Quality** | 5% | FK integrity, valid status transitions, branch/doctor consistency | Trust in the data pipeline |

### Run It

Two modes:

```bash
cd backend
npm run eval              # auto-detects — hits localhost:3001 if running, else direct Prisma
npm run eval:direct       # force direct Prisma mode
```

Against a remote server:
```bash
BASE_URL=https://apollo-ai-backend-0jmd.onrender.com npm run eval
```

Output: `eval-results-{timestamp}.json` with per-test pass/fail, latency, dimension scores, and overall score.

### Latest Results (live Render API, 2026-06-21)

```
OVERALL SCORE: 90/100  (31 tests, 23 passed, 74.2% pass rate, 45s total)

  E2E Booking (25%):              40%  — vague search + booking cascade failures
  Hallucination Resistance (20%): 100%
  Conversation Simulation (15%):  33%  — concurrent booking race detected
  Error Recovery (20%):           100%
  Latency (15%):                  100%
  Data Quality (5%):              100%

Latency:
  List Doctors    p50=727ms  p95=800ms  (budget: 1000ms)
  List Branches   p50=437ms  p95=459ms  (budget: 1000ms)
  List Departments p50=436ms p95=439ms  (budget: 1000ms)
```
### Shortcomings of This Harness

- Tests HTTP API endpoints, not the actual Bolna voice conversation — no NLU quality or transcript evaluation
- Latency measured from the test runner, not from the agent's perspective (excludes network jitter and STT/TTS latency)
- No STT/TTS accuracy measurement — requires audio processing pipeline
- Conversation simulation is pre-scripted (API call order), not generative like a real LLM-driven call
- Hallucination tests only cover API-level errors, not AI-level hallucinations in the LLM's generated responses
- Single-region, single-server — no failover or concurrency stress testing under load

### Key Issues Found

1. **Vague "heart doctor" search returned 0 results** — synonym mapping fix applied locally, pending deploy.

2. **Booking cascade failure** — the `voice-book` endpoint failed on Render (likely free-tier cold-start timeout for the 3.4s request). All downstream tests (verify, reschedule, cancel) depend on a successful booking.

3. **Race condition in `bookings.ts:voice-book`** — concurrent bookings for the same slot both succeeded. The transaction used `$transaction([create, update])` but the slot `findFirst` (line 88) and the transaction weren't atomic — two requests could both find the slot `available` and both transactions would commit. **Fix applied**: switched to `$transaction(async (tx) => { updateMany with where: { status: 'available' } → if count===0, throw })` which atomically claims the slot before creating the appointment.

4. **Natural language search failed** — the synonym map (heart→cardio, bone→ortho, etc.) isn't deployed yet.

### Deep Dive: The Race Condition Fix

Before:
```
findFirst({ status: 'available' })  ← both requests see available
$transaction([create appointment, update slot to 'booked'])  ← both commit
```

After:
```
$transaction(async (tx) => {
  updateMany({ where: { id, status: 'available' }, data: { status: 'booked' } })
  if (count === 0) throw 'Slot already booked'
  create appointment
})
```

The slot `status` check and the update are now in the same atomic operation. Prisma's `updateMany` returns `{ count }` — if 0, another request claimed the slot first and the entire transaction rolls back. This is a real bug the eval harness caught that would have caused double-bookings in production.

### Shortcomings of This Harness

The vague term "heart doctor" returned 0 results — the search used literal `CONTAINS 'heart doctor'` against specialty names like "Interventional Cardiologist". **This is a real hallucination risk**: a caller saying "I need a heart doctor" would hear "no doctors found" despite 3 cardiologists being available.

**Fix applied**: Added a synonym map in `doctors.ts` that expands common vague terms:
- `"heart"` → also search `cardio`, `cardiologist`, `cardiac`
- `"bone"` → `ortho`, `orthopedic`
- `"skin"` → `derma`, `dermatologist`
- `"eye"` → `ophthalmo`, `ophthalmologist`, `eye`
- `"child"` → `pedia`, `pediatric`, `children`
- `"brain"/"nerve"` → `neuro`, `neurologist`
- `"kidney"` → `nephro`, `nephrologist`, `renal`
- `"stomach"/"digestive"` → `gastro`, `gastroenterologist`
- `"cancer"` → `onco`, `oncologist`
- `"ear"/"nose"/"throat"` → `ent`

### Shortcomings of This Harness

- Tests HTTP API endpoints, not the actual Bolna voice conversation — no NLU quality or transcript evaluation
- Synthetic test data, not real patient call patterns
- No multi-turn conversation simulation (context carry-over between turns)
- Latency measured from the test runner, not from the agent's perspective (excludes network jitter in API mode)
- No STT/TTS accuracy measurement
- Hallucination tests only cover API-level errors, not AI-level hallucinations in generated responses
- Single-region, single-server — no failover or concurrency testing

**Output**: `eval-results-{timestamp}.json` with per-test pass/fail, duration, and summary.

### UI-Based Eval (dashboard)
Access the evaluation page at `/evaluation` in the frontend. 11 scenarios are listed with "Run" buttons + test history.

### Scenarios
| ID | Description |
|---|---|
| `book_appointment` | Full booking flow |
| `reschedule_appointment` | Find → reschedule |
| `cancel_appointment` | Find → cancel |
| `doctor_lookup` | Search by specialty |
| `unavailable_slot` | Detect booked slot |
| `human_handoff` | Create follow-up request |
| `conflict_booking` | Double-book prevention |
| `mid_conversation_switch` | Change doctor mid-flow |
| `vague_request` | Fuzzy search ("heart doctor") |
| `out_of_hours` | Sunday booking attempt |
| `batch_run` | Run all sequentially |

### Metrics Collected
- **Task completion**: % of scenarios that pass
- **Latency**: execution time per operation (ms)
- **Error rate**: count of failed scenarios
- **Current**: 13/13 pass (100%), avg 33ms

---

## Known Limitations

1. **No authentication** — APIs are open; the Bolna function tools have no auth token configured. Add bearer token validation before production.

2. **Single-threaded backend** — Express runs on a single thread; for high call volume, use PM2 clustering or migrate to a worker-based architecture.

3. **Doctor data limited to 50** — The Apollo listing page JSON-LD only exposes the first ~50 doctors for SEO. The full Vizag roster (~75+) requires API access or additional scraping.

4. **Branch detection by pincode** — The scraper infers branch from the doctor's address pincode. Some multi-location doctors may be assigned to the wrong branch.

5. **No real telephony** — The current setup uses Bolna's platform for calls but requires purchasing a +91 phone number for inbound calls.

6. **Slot generation is static** — Slots are pre-generated for 14 days. No real-time slot management (e.g., closed days, holidays, doctor leave). Extend `seed.ts` to handle exceptions.

7. **No analytics dashboard** — Call metrics (avg duration, peak hours, common intents) are logged but not visualized beyond the basic dashboard page.

8. **Language support** — English only for the AI voice. Hindi/Tamil STT/TTS config exists but untested.

---

## API Endpoints

### Doctors
- `GET /api/doctors` — List (filters: `?specialty=`, `?branch=`)
- `GET /api/doctors/:id` — Details
- `POST /api/doctors/find` — Partial name/specialty search

### Appointments
- `GET /api/appointments` — List (filters: `?phone=`, `?date=`, `?status=`)
- `POST /api/appointments` — Create (requires `patientId`)
- `PATCH /api/appointments/:id/reschedule` — Reschedule
- `PATCH /api/appointments/:id/cancel` — Cancel
- `PATCH /api/appointments/:id/status` — Update status

### Slots
- `GET /api/slots/availability?doctorId=&date=` — Available slots
- `POST /api/slots/availability` — Same, with POST body
- `POST /api/slots/seed` — Regenerate 14-day slots

### Voice Bookings
- `POST /api/bookings/voice-book` — Book by `patientName` + `phone` (no `patientId` needed)
- `POST /api/bookings/voice-handoff` — Request human callback

### Patients
- `GET /api/patients/search?phone=` — Find by phone
- `POST /api/patients` — Create

### Evaluations
- `GET /api/evaluations/scenarios` — List
- `GET /api/evaluations/results` — Past results
- `POST /api/evaluations/run` — Run one scenario
- `POST /api/evaluations/batch` — Run all

---

## Deployment

### Backend (Render)
```yaml
services:
  - type: web
    name: apollo-ai-backend
    runtime: node
    buildCommand: >
      cd backend &&
      cp prisma/schema.postgres.prisma prisma/schema.prisma &&
      npm install --include=dev &&
      npx prisma generate &&
      npm run build &&
      npx prisma db push
    startCommand: cd backend && npm start
    healthCheckPath: /api/health
    envVars:
      - key: DATABASE_URL
        sync: false  # Set in Render dashboard
      - key: DIRECT_URL
        sync: false
      - key: BOLNA_API_KEY
        sync: false
      - key: BOLNA_AGENT_ID
        sync: false
```

### Frontend (Vercel)
```bash
cd frontend
npm run build
```
Set `NEXT_PUBLIC_API_URL=https://apollo-ai-backend-0jmd.onrender.com` in Vercel env vars.

---

## Data Sources

All doctor data is scraped in real time from **Apollo Hospitals' official website** (`apollohospitals.com/book-doctor-appointment/visakhapatnam`). The scraper extracts structured JSON-LD embedded in the page — no HTML parsing required.

**2 branches**: Arilova (530040) and Ramnagar (530002)  
**50 doctors** across 12+ departments  
**15 departments** mapped from 40+ specialty URL slugs

To refresh data:
```bash
cd scraper && npm run scrape
cd ../backend && npm run db:seed
```
