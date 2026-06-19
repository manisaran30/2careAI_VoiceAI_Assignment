# Bolna Integration Plan - Healthcare AI Receptionist

## Overview
Integrate Bolna Voice AI into the Apollo Healthcare chatbot to handle inbound/outbound patient calls for appointment booking, rescheduling, cancellation, FAQs, and human escalation.

## What We Need from Bolna

### 1. Account and Credentials
| Item | Where to Get | Purpose |
|------|-------------|---------|
| API Key | Bolna Dashboard > Developers > Create API Key | Authenticate all API calls |
| Agent ID | Created agent > Copy Agent ID | Make outbound calls, link webhooks |

### 2. Agent Configuration
- Name: Apollo Chennai AI Receptionist
- Languages: English (primary), Hindi, Tamil (optional)
- Phone Number: Buy a number (+91-xxx) for inbound calls
- LLM: GPT-4o or Gemini 2.5 Flash
- Voice: Indian English voice

### 3. Function Tools (Custom APIs - our backend)
| Function | Our Endpoint | Purpose |
|----------|-------------|---------|
| check_doctor | GET /api/doctors | Find doctors by specialty |
| check_slot | GET /api/appointments/slots | Check available slots |
| create_appointment | POST /api/appointments | Book appointment |
| reschedule_appointment | PATCH /api/appointments/:id/reschedule | Reschedule |
| cancel_appointment | PATCH /api/appointments/:id/cancel | Cancel |
| fetch_patient_bookings | GET /api/appointments | Get patient appointments |
| request_human_handoff | POST /api/callbacks | Escalate to staff |

### 4. Webhooks (receive events from Bolna)
| Event | Our Endpoint | Purpose |
|-------|-------------|---------|
| call-started | POST /api/webhooks/bolna/call-started | Log call start |
| call-completed | POST /api/webhooks/bolna/call-completed | Save summary |
| booking | POST /api/webhooks/bolna/booking | Handle booking outcomes |

## Integration Steps

### Step 1: Get Bolna Credentials
- Sign up at platform.bolna.ai
- Generate API Key: Dashboard > Developers > Create API Key
- Buy phone number: Dashboard > Phone Numbers > Buy (+91 Indian number)

### Step 2: Create Agent on Bolna
1. Agent Setup > + New Agent
2. Configure Agent, LLM, Audio, Tools, Analytics, Inbound tabs
3. Add 7 custom function tools pointing to our backend APIs
4. Set webhook URL to our backend

### Step 3: Update Backend .env
BOLNA_API_KEY, BOLNA_WEBHOOK_SECRET, BOLNA_AGENT_ID

### Step 4: Webhook endpoints already exist in code
- POST /api/webhooks/bolna/call-started
- POST /api/webhooks/bolna/call-completed
- POST /api/webhooks/bolna/booking

### Step 5: Upload Knowledge Base
Upload scraped-data.json to Bolna Knowledge Base

## What to Do on Bolna Dashboard (Manual)
1. Create Agent: Agent Setup > + New Agent
2. Configure Prompts: Use conversation design from ARCHITECTURE_PLAN.md
3. Upload Knowledge Base: Settings > Knowledge Base > Upload scraped-data.json
4. Add Function Tools: Tools Tab > Custom Functions > Add 7 APIs
5. Set Webhook: Analytics Tab > Webhook URL
6. Buy Phone Number: Get +91 number for inbound calls
7. Link Inbound: Assign number to agent in Inbound Tab
