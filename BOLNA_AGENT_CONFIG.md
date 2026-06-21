# Bolna Agent Configuration — Apollo Vizag AI Receptionist

> This document captures every setting to configure in the Bolna dashboard for the Apollo Hospitals AI Receptionist agent.
> Configure these settings manually at https://platform.bolna.ai after signing in.

---

## Table of Contents
1. [Agent Info](#1-agent-info)
2. [Agent Tab — Welcome Message](#2-welcome-message)
3. [Agent Tab — Canvas (System Prompt)](#3-canvas-system-prompt)
4. [Agent Tab — Language Switching](#4-language-switching)
5. [Agent Tab — Advanced Settings](#5-advanced-settings)
6. [Agent Tab — Hangup Using Prompt](#6-hangup-using-prompt)
7. [LLM Tab](#7-llm-tab)
8. [Audio Tab](#8-audio-tab)
9. [Call Tab](#9-call-tab)
10. [Tools Tab — Custom Functions (7 APIs)](#10-tools-tab--custom-functions)
11. [Analytics Tab — Webhooks & Post-Call Tasks](#11-analytics-tab)
12. [Inbound Tab](#12-inbound-tab)
13. [Engine Tab](#13-engine-tab)
14. [Context Variables Summary](#14-context-variables-summary)
15. [Knowledge Base](#15-knowledge-base)

---

## 1. Agent Info

| Field | Value |
|-------|-------|
| **Agent Name** | Apollo Vizag AI Receptionist |
| **Description** | AI receptionist for Apollo Hospitals Visakhapatnam — handles appointment booking, rescheduling, cancellations, doctor lookups, FAQs, and human handoffs. |
| **Primary Language** | English (`en`) |
| **Secondary Languages** | Hindi (`hi`), Tamil (`ta`) — optional |
| **Timezone** | Asia/Kolkata (UTC+05:30) |

---

## 2. Welcome Message

Set in **Agent Tab > Welcome Message**:

```
Hello! Welcome to Apollo Hospitals Visakhapatnam. I'm your AI receptionist. How can I help you today? You can ask me to book an appointment, find a doctor, or get information about our services.
```

**Guidelines:**
- Keep it short (< 20 words if possible)
- Personalized with `{patient_name}` when available from caller ID
- Warm, professional tone — first impression sets the call quality

---

## 3. Canvas (System Prompt)

Set in **Agent Tab > English (Primary) > Canvas**:

```
You are an AI receptionist for Apollo Hospitals Visakhapatnam. Help patients book, reschedule, or cancel appointments. Find the right doctor and answer hospital questions.

Warm, professional, patient. Be concise — voice calls need short responses. Show empathy. Use your tools to fetch real data — never invent information.

## Call Flow
1. Greet warmly, identify intent
2. Collect info: booking → specialty → doctor → date → slot → patient details → confirm
3. Always explain before calling a tool (use pre_call_message)
4. If slot unavailable, immediately suggest the next alternative
5. Confirm before finalizing. Summarize after completing. Ask if anything else is needed.

## Guardrails
- Never share other patients' information
- Never discuss competitors
- Never promise wait times or availability — use tools
- For medical emergencies: advise calling 108 or visiting the emergency room
- No medical advice — refer clinical questions to doctors
- If stuck: offer human handoff

## Number Formatting
- Times: "10 AM", "3 PM" — NOT "ten hundred hours" or digit-by-digit
- Fees: "one thousand nine hundred rupees" — NOT "nineteen hundred"
- Dates: "June 22nd" — NOT "22/06/2026"
- Phones: digit by digit "nine one eight nine one two..." 
- No punctuation read aloud (no "colon", "comma")

## Reminders
- Fees paid at hospital, not on call
- Ask patients to arrive 15 min early
- Arilova: Weekday 6AM-10PM, Weekend 6AM-6PM
- Ramnagar: Weekday 7AM-9PM, Weekend 7AM-5PM
- Both branches: Emergency 24x7
```

---

## 4. Language Switching

Set in **Agent Tab (shared across all languages)**:

```
Switch to the language the user is currently speaking in.
If the user speaks in Hindi, respond in Hindi.
If the user speaks in Tamil, respond in Tamil.
If the user speaks in a language other than English, Hindi, or Tamil, respond in English.
Always respond in the same language the user's last message was in.
```

---

## 5. Advanced Settings

### English (Primary)

| Field | Value |
|-------|-------|
| **Agent Name** | AI Receptionist |
| **Handoff Message** | Let me connect you with a team member who can help. One moment please. |

### Hindi (Secondary — optional)

| Field | Value |
|-------|-------|
| **Agent Name** | AI रिसेप्शनिस्ट |
| **Handoff Message** | मैं आपको एक टीम सदस्य से जोड़ रहा हूं जो आपकी मदद कर सके। कृपया एक क्षण प्रतीक्षा करें। |

### Tamil (Secondary — optional)

| Field | Value |
|-------|-------|
| **Agent Name** | AI வரவேற்பாளர் |
| **Handoff Message** | உங்களுக்கு உதவக்கூடிய குழு உறுப்பினருடன் உங்களை இணைக்கிறேன். தயவுசெய்து ஒரு கணம் காத்திருக்கவும். |

---

## 6. Hangup Using Prompt

Toggle **ON** in **Agent Tab > Hangup using a prompt**:

```
A conversation is considered complete if any of the following conditions are met:

1. The patient has confirmed an appointment (booking, rescheduling) and has no further requests after being asked "Is there anything else I can help you with?"

2. The patient has confirmed cancellation and has no further requests.

3. The patient has received the information they asked for (doctor details, FAQs) and has no further requests.

4. The patient has been transferred to a human agent (handoff initiated) and the transfer message has been delivered.

5. The patient explicitly says goodbye, thank you, or indicates they want to end the call (e.g., "that's all", "no thanks", "bye", "goodbye").

6. The patient is not reachable or the line goes silent after the closing message.

Closing message before hangup: "Thank you for calling Apollo Hospitals Visakhapatnam. Have a great day! Goodbye."

The last message in the transcript must be from the user or the closing message has been delivered.
```

---

## 7. LLM Tab

| Setting | Value |
|---------|-------|
| **Provider** | OpenAI (or Azure OpenAI if enterprise) |
| **Model** | `gpt-4o` (or `gpt-4.1-mini` for cost efficiency) |
| **Tokens Generated** | 300 (keep responses concise for voice) |
| **Temperature** | 0.4 (balanced between consistency and naturalness) |
| **Knowledge Base** | Select the uploaded Apollo Hospitals knowledge base(s) |

**Why these values:**
- **gpt-4o**: Best balance of speed, accuracy, and natural conversation for voice
- **300 tokens**: Voice responses need to be concise — long responses feel unnatural
- **0.4 temperature**: Low enough for consistent tool calling, high enough for warm conversation

---

## 8. Audio Tab

### Languages

| Language | Primary | Code |
|----------|---------|------|
| English | ✅ Yes | `en` |
| Hindi | No | `hi` |
| Tamil | No | `ta` |

### Speech-to-Text (STT) — English

| Setting | Value |
|---------|-------|
| **Provider** | Deepgram |
| **Model** | `nova-3` |
| **Keywords** | `Apollo:100`, `Arilova:80`, `Ramnagar:80`, `Visakhapatnam:80`, `Vizag:80`, `Telugu:80`, `Cardiology:80`, `Orthopedics:80` |

### Speech-to-Text (STT) — Hindi (optional)

| Setting | Value |
|---------|-------|
| **Provider** | Sarvam |
| **Model** | Saarika |

### Speech-to-Text (STT) — Tamil (optional)

| Setting | Value |
|---------|-------|
| **Provider** | Sarvam |
| **Model** | Saarika |

### Text-to-Speech (TTS) — English

| Setting | Value |
|---------|-------|
| **Provider** | ElevenLabs |
| **Model** | `eleven_turbo_v2_5` |
| **Voice** | Choose an Indian English voice (e.g., "Nila" or a custom Indian English voice) |

### Text-to-Speech (TTS) — Hindi (optional)

| Setting | Value |
|---------|-------|
| **Provider** | Sarvam |
| **Model** | `Bulbul v2` |
| **Voice** | Choose a Hindi voice (e.g., "Anjura") |

### Text-to-Speech (TTS) — Tamil (optional)

| Setting | Value |
|---------|-------|
| **Provider** | Sarvam |
| **Model** | `Bulbul v2` |
| **Voice** | Choose a Tamil voice |

### Voice Tuning (ElevenLabs)

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Buffer Size** | 200 | Smooth audio without too much delay |
| **Speed Rate** | 1.0 | Natural pace |
| **Similarity Boost** | 0.75 | Faithful to voice sample |
| **Stability** | 0.6 | Slight expressiveness |
| **Style Exaggeration** | 0 | Neutral style for professional tone |

---

## 9. Call Tab

### Telephony Provider

Select your telephony provider (buy a number from Bolna or connect your own):

| Setting | Value |
|---------|-------|
| **Provider** | Plivo (recommended for India) or Twilio |
| **Phone Number** | +91 purchased number (buy from Bolna Dashboard > Phone Numbers) |

### Call Features

| Feature | Setting |
|---------|---------|
| **Noise Cancellation** | ON — set to 70 (balances clarity with naturalness) |
| **Voicemail Detection** | ON — avoid leaving messages on answering machines |
| **Keypad Input (DTMF)** | OFF (conversational AI handles everything) |
| **Auto Reschedule** | ON — retry failed calls once after 30 minutes |

### Ambient Noise

| Setting | Value |
|---------|-------|
| **Ambient Noise** | OFF (clean calls for healthcare setting) |
| *(If desired)* | "Office Ambience" at low volume for natural feel |

### Final Call Message

| Language | Message |
|----------|---------|
| English | Thank you for calling Apollo Hospitals Visakhapatnam. Have a great day! Goodbye. |
| Hindi | अपोलो हॉस्पिटल्स विशाखापट्टनम में कॉल करने के लिए धन्यवाद। आपका दिन शुभ हो! नमस्ते। |
| Tamil | அப்போலோ மருத்துவமனை விசாகப்பட்டினத்திற்கு அழைத்ததற்கு நன்றி. உங்கள் நாள் இனியதாக அமையட்டும்! வணக்கம். |

### Call Management

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Hangup on User Silence** | 10 seconds | Gives patient time to think |
| **Total Call Timeout** | 600 seconds (10 min) | Most healthcare calls wrap up in 3-7 min |

### Outbound Call Timing Restrictions

| Setting | Value |
|---------|-------|
| **Enabled** | ON |
| **Allowed Time Window** | 8:00 AM — 8:00 PM (recipient local time) |

---

## 10. Tools Tab — Custom Functions

Add these **7 custom functions** in the Tools Tab. Each uses the **Write manually** option.

### Function 1: `check_doctor`

```
{
  "name": "check_doctor",
  "description": "Use this function when the patient asks to find a doctor, look up doctors by specialty or department, check which doctors are available in a specific branch, or get information about a doctor's experience, consultation fee, or languages spoken.",
  "pre_call_message": "Let me check the available doctors for you.",
  "parameters": {
    "type": "object",
    "properties": {
      "specialty": {
        "type": "string",
        "description": "The medical specialty or department name the patient is looking for, e.g., 'Cardiology', 'Orthopedics', 'Dermatology', 'Pediatrics', 'General Medicine', 'ENT', 'Ophthalmology', 'Gastroenterology', 'Neurology', 'Gynecology'."
      },
      "branch": {
        "type": "string",
        "description": "Optional branch name to filter doctors by location, e.g., 'Arilova', 'Ramnagar'."
      }
    },
    "required": ["specialty"]
  },
  "key": "custom_task",
  "value": {
    "method": "GET",
    "param": {
      "specialty": "%(specialty)s",
      "branch": "%(branch)s"
    },
    "url": "https://your-backend-url.com/api/doctors",
    "api_token": "",
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

> **Note:** Replace `https://your-backend-url.com` with your actual deployed backend URL (e.g., `https://your-app.onrender.com`).
> No `api_token` is needed since this is an open dashboard for evaluation. Add Bearer token if you add auth later.

---

### Function 2: `check_slot`

```
{
  "name": "check_slot",
  "description": "Use this function when the patient wants to check available appointment times for a specific doctor on a specific date. Call this AFTER the patient has chosen a doctor and provided a preferred date.",
  "pre_call_message": "Let me check the available appointment slots.",
  "parameters": {
    "type": "object",
    "properties": {
      "doctorId": {
        "type": "string",
        "description": "The unique ID of the doctor (returned from check_doctor function)."
      },
      "date": {
        "type": "string",
        "description": "The preferred appointment date in YYYY-MM-DD format."
      }
    },
    "required": ["doctorId", "date"]
  },
  "key": "custom_task",
  "value": {
    "method": "GET",
    "param": {
      "doctorId": "%(doctorId)s",
      "date": "%(date)s"
    },
    "url": "https://your-backend-url.com/api/appointments/slots",
    "api_token": "",
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

---

### Function 3: `create_appointment`

```
{
  "name": "create_appointment",
  "description": "Use this function when the patient confirms they want to book an appointment. Call this ONLY after the patient has agreed to a specific doctor, date, time, and branch. Collect all required information before calling.",
  "pre_call_message": "Booking your appointment now. One moment please.",
  "parameters": {
    "type": "object",
    "properties": {
      "patientId": {
        "type": "string",
        "description": "The patient's unique ID from the system. Look up patient by phone number first if needed."
      },
      "doctorId": {
        "type": "string",
        "description": "The unique ID of the doctor the patient wants to see."
      },
      "branchId": {
        "type": "string",
        "description": "The unique ID of the branch where the appointment will be."
      },
      "date": {
        "type": "string",
        "description": "The appointment date in YYYY-MM-DD format."
      },
      "time": {
        "type": "string",
        "description": "The appointment time in HH:MM format, e.g., '10:30'."
      },
      "reason": {
        "type": "string",
        "description": "Optional brief reason for the visit, e.g., 'General checkup', 'Follow-up', 'Heart consultation'."
      }
    },
    "required": ["patientId", "doctorId", "branchId", "date", "time"]
  },
  "key": "custom_task",
  "value": {
    "method": "POST",
    "param": {
      "patientId": "%(patientId)s",
      "doctorId": "%(doctorId)s",
      "branchId": "%(branchId)s",
      "date": "%(date)s",
      "time": "%(time)s",
      "reason": "%(reason)s"
    },
    "url": "https://your-backend-url.com/api/appointments",
    "api_token": "",
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

---

### Function 4: `reschedule_appointment`

```
{
  "name": "reschedule_appointment",
  "description": "Use this function when the patient wants to change the date or time of an existing appointment. First find the patient's booking using fetch_patient_bookings, then call this function with the new date and time.",
  "pre_call_message": "Rescheduling your appointment now.",
  "parameters": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "The unique ID of the existing appointment to reschedule."
      },
      "date": {
        "type": "string",
        "description": "The new appointment date in YYYY-MM-DD format."
      },
      "time": {
        "type": "string",
        "description": "The new appointment time in HH:MM format, e.g., '14:30'."
      }
    },
    "required": ["id", "date", "time"]
  },
  "key": "custom_task",
  "value": {
    "method": "PATCH",
    "param": {
      "id": "%(id)s",
      "date": "%(date)s",
      "time": "%(time)s"
    },
    "url": "https://your-backend-url.com/api/appointments/%(id)s/reschedule",
    "api_token": "",
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

---

### Function 5: `cancel_appointment`

```
{
  "name": "cancel_appointment",
  "description": "Use this function when the patient wants to cancel an existing appointment. First find the patient's booking using fetch_patient_bookings, then call this function with the appointment ID. Always confirm with the patient before cancelling.",
  "pre_call_message": "Cancelling your appointment now.",
  "parameters": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "description": "The unique ID of the appointment to cancel."
      }
    },
    "required": ["id"]
  },
  "key": "custom_task",
  "value": {
    "method": "PATCH",
    "param": {
      "id": "%(id)s"
    },
    "url": "https://your-backend-url.com/api/appointments/%(id)s/cancel",
    "api_token": "",
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

---

### Function 6: `fetch_patient_bookings`

```
{
  "name": "fetch_patient_bookings",
  "description": "Look up a patient's existing appointments by phone number or name. Ask for their phone number first, but if they don't know it, ask for their full name as an alternative.",
  "pre_call_message": "Let me look up your appointments.",
  "parameters": {
    "type": "object",
    "required": [],
    "properties": {
      "phone": {
        "type": "string",
        "description": "Patient's registered phone number"
      },
      "name": {
        "type": "string",
        "description": "Patient's full name (alternative to phone)"
      }
    }
  },
  "key": "custom_task",
  "value": {
    "method": "GET",
    "param": {
      "phone": "%(phone)s",
      "name": "%(name)s"
    },
    "url": "https://apollo-ai-backend-0jmd.onrender.com/api/appointments",
    "api_token": null,
    "headers": {
      "Content-Type": "application/json"
    },
    "pre_call_webhook_url": null,
    "pre_call_webhook_param": null
  }
}
```

---

### Function 7: `request_human_handoff`

```
{
  "name": "request_human_handoff",
  "description": "Use this function when the patient explicitly asks to speak to a human, when the AI cannot handle the request, when the patient is upset or frustrated, or for any situation that requires human judgment or empathy beyond the AI's capabilities.",
  "pre_call_message": "Let me connect you with a team member who can help you further.",
  "parameters": {
    "type": "object",
    "properties": {
      "patientId": {
        "type": "string",
        "description": "The patient's unique ID from the system."
      },
      "reason": {
        "type": "string",
        "description": "A brief explanation of why the patient needs human assistance."
      },
      "notes": {
        "type": "string",
        "description": "Optional additional context or notes for the human agent."
      }
    },
    "required": ["patientId", "reason"]
  },
  "key": "custom_task",
  "value": {
    "method": "POST",
    "param": {
      "patientId": "%(patientId)s",
      "reason": "%(reason)s",
      "notes": "%(notes)s"
    },
    "url": "https://your-backend-url.com/api/callbacks",
    "api_token": "",
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

---

## 11. Analytics Tab

### Webhook URL

| Setting | Value |
|---------|-------|
| **Push all execution data to webhook** | `https://your-backend-url.com/api/webhooks/bolna/execution-update` |

This single webhook URL receives all execution updates (status changes, completions, errors). Our backend routes them to the appropriate handlers.

### Post-Call Tasks

| Task | Enabled | Configuration |
|------|---------|---------------|
| **Summarization** | ✅ ON | Automatically generate conversation summaries |
| **Extractions** | ✅ ON | See extraction templates below |

### Extraction Categories & Templates

#### Category: Appointment Booking Info

| Template | Extraction Prompt | Answer Type |
|----------|-----------------|-------------|
| **Intent** | What was the primary intent of this call? | Pre-defined: `appointment_booking`, `appointment_reschedule`, `appointment_cancel`, `doctor_lookup`, `faq`, `human_handoff`, `other` |
| **Outcome** | What was the final outcome of this call? | Pre-defined: `booked`, `rescheduled`, `cancelled`, `information_provided`, `handoff_created`, `incomplete`, `failed` |
| **Patient Name** | What is the patient's full name? | Free Text |
| **Doctor** | Which doctor was discussed or booked? | Free Text |
| **Department** | Which medical department was involved? | Free Text |
| **Branch** | Which hospital branch was mentioned? | Pre-defined: `Arilova`, `Ramnagar`, `not_specified` |
| **Appointment Time** | What date and time was the appointment scheduled for? Format: YYYY-MM-DD HH:MM | Free Text |
| **Appointment ID** | If an appointment was created, what is its ID? | Free Text |

#### Category: Call Quality

| Template | Extraction Prompt | Answer Type |
|----------|-----------------|-------------|
| **Patient Sentiment** | How would you describe the patient's sentiment during the call? | Pre-defined: `positive`, `neutral`, `frustrated`, `confused`, `urgent` |
| **Handoff Required** | Did the call require a human handoff? | Pre-defined: `yes`, `no` |
| **Handoff Reason** | If handoff was required, what was the reason? | Free Text |

---

## 12. Inbound Tab

Configure only if using inbound calls (patients dial in to a published number).

### Database for Inbound Phone Numbers

| Setting | Value |
|---------|-------|
| **Data Source** | Use your internal APIs |
| **API Endpoint URL** | `https://your-backend-url.com/api/patients/search?phone={from_number}` |
| **Auth Token** | *Leave blank for now (open evaluation)* |

### Expected API Response Format

```json
{
  "success": true,
  "data": {
    "id": "patient_cuid",
    "name": "Rajesh Kumar",
    "phone": "+919876543210",
    "email": "rajesh@example.com"
  }
}
```

### Call Restrictions

| Setting | Value |
|---------|-------|
| **Allow Calls Only from Database** | OFF (allow any caller for evaluation) |

### Spam Prevention

| Setting | Value |
|---------|-------|
| **Maximum Calls per Phone Number** | `-1` (unlimited for evaluation) |
| **Always-Allow List** | *Leave empty for now* |

---

## 13. Engine Tab

### Transcription & Interruptions

| Setting | Value |
|---------|-------|
| **Generate Precise Transcript** | ON (important for compliance and analytics) |
| **Interruption Threshold** | 2 words (allows natural interruptions without cutting off) |

### Response Latency

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Response Rate** | Custom | Fine-tuned for natural conversation |
| **Endpointing (ms)** | 250 | Balances responsiveness with not cutting off users |
| **Linear Delay (ms)** | 450 | Accounts for natural mid-sentence pauses in Indian English |

### User Online Detection

| Setting | Value |
|---------|-------|
| **Enabled** | ON |
| **Message** | "Hello? Are you still there?" |
| **Invoke message after (seconds)** | 10 |

---

## 14. Context Variables Summary

These system variables are available in every call automatically and can be used in prompts and function parameters:

| Variable | Description | Usage in Our Agent |
|----------|-------------|-------------------|
| `{agent_id}` | Unique ID of the agent | Logging, debugging |
| `{execution_id}` | Unique ID of the call execution | Session tracking, linking calls |
| `{call_sid}` | Phone system call ID | Telephony debugging |
| `{from_number}` | Caller's phone number | Patient lookup, appointment search |
| `{to_number}` | Agent's phone number | Routing, identification |
| `{current_date}` | Current date in caller's timezone | Slot availability, appointment dates |
| `{current_time}` | Current time in caller's timezone | Timing context |
| `{timezone}` | Caller's detected timezone | Scheduling accuracy |

Custom user variables to define in the prompt (they auto-appear in test fields):
- `{patient_name}` — Patient's name (from API lookup or caller input)

---

## 15. Knowledge Base

### What to Upload

The file `BOLNA_KNOWLEDGE_BASE.md` contains the full knowledge base content. Upload it via **LLM Tab > Select knowledge bases > Add new knowledgebase**.

Alternatively, upload the scraped data directly:

| Method | Details |
|--------|---------|
| **Option 1: Upload markdown** | Copy content from `BOLNA_KNOWLEDGE_BASE.md` into a `.txt` file and upload |
| **Option 2: Upload JSON** | Upload `scraper/scraped-data.json` directly |
| **Option 3: Add URLs** | Add `https://www.apollohospitals.com` as a URL source |

### What the Knowledge Base Covers

- Branch details (Arilova, Ramnagar) with addresses, phones, timings
- All 15 departments with descriptions
- 50 real Vizag doctors with specialties, experience, fees, availability
- 16 common FAQs with answers
- Appointment booking flow instructions

---

## Deployment Checklist

Before making the agent live:

- [ ] Replace `https://your-backend-url.com` with actual deployed backend URL in all 7 function tools
- [ ] Test each function tool individually using the Bolna playground
- [ ] Verify webhook delivery by making a test call and checking backend logs
- [ ] Set up SSL/HTTPS for the backend (required for webhooks)
- [ ] Add `BOLNA_API_KEY` and `BOLNA_AGENT_ID` to backend `.env`
- [ ] Test an end-to-end call flow: book → reschedule → cancel
- [ ] Verify dashboard reflects call outcomes
- [ ] Test error handling (invalid phone, unavailable slot, etc.)
