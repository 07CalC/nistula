# Nistula — Guest Message Handler

Backend system that receives guest messages from multiple channels (WhatsApp, Booking.com, Airbnb, Instagram, Direct), normalizes them into a unified schema, classifies the query type, drafts a reply using Claude (via the Vercel AI SDK), and returns the reply with a confidence score.

Built for the Nistula technical assessment.

---

## Setup

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/07CalC/nistula
cd nistula
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and add your Anthropic API key:

```bash
cp .env.example .env
```

Then edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-api-your-key-here
PORT=3000
```

### Run

```bash
npm run dev
```

The server starts on `http://localhost:3000`.

### Test

```bash
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{
    "source": "whatsapp",
    "guest_name": "Rahul Sharma",
    "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
    "timestamp": "2026-05-05T10:30:00Z",
    "booking_ref": "NIS-2024-0891",
    "property_id": "villa-b1"
  }'
```

## or use pre build script

- run the dev server using `npm run dev`
- then run the test script using `node test-request.js`

---

## Endpoints

### POST /webhook/message

Accepts an inbound guest message and returns an AI-drafted reply.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| source | enum | yes | `whatsapp`, `booking_com`, `airbnb`, `instagram`, `direct` |
| guest_name | string | yes | Guest's display name |
| message | string | yes | Raw message text |
| timestamp | string (ISO 8601) | yes | When the message was sent |
| booking_ref | string | no | Existing booking reference (e.g. NIS-2024-0891) |
| property_id | string | no | Property identifier (e.g. villa-b1) |

**Response:**

```json
{
  "message_id": "uuid",
  "query_type": "pre_sales_availability",
  "drafted_reply": "Hi Rahul! Great news...",
  "confidence_score": 0.91,
  "action": "auto_send"
}
```

### GET /health

Health check endpoint.

---

## Architecture

```
POST /webhook/message
       │
       ▼
  Zod validation ──── 400 if invalid
       │
       ▼
  Query classifier (regex-based)
       │
       ▼
  Confidence scorer (4-factor weighted)
       │
       ▼
  Claude API (Vercel AI SDK + @ai-sdk/anthropic)
       │
       ▼
  Response with action decision
```

### Query Classification

Messages are classified into 6 types via regex pattern matching in `src/services/classifier.ts`:

- **pre_sales_availability** — Availability questions
- **pre_sales_pricing** — Rate and pricing questions
- **post_sales_checkin** — Check-in details, WiFi, timings
- **special_request** — Early check-in, transfers, extras
- **complaint** — Problems, broken things, refunds
- **general_enquiry** — Everything else (fallback)

The classifier uses a booking_ref presence heuristic: if a booking_ref exists, it first checks for complaint or post-sales patterns before pre-sales patterns.

### Confidence Scoring (src/services/confidence.ts)

Four factors weighted and summed:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Source reliability** | 15% | Structured channels (booking_com: 0.95) score higher than informal ones (instagram: 0.60) |
| **Query clarity** | 35% | Longer messages with question marks score higher; vague greetings subtract |
| **Context completeness** | 25% | Booking ref + property ID present = higher confidence |
| **Query complexity** | 25% | Routine questions (check-in: 0.95) score higher than open-ended ones (complaints: 0.50) |

Formula: `score = Σ(factor × weight)`, rounded to 2 decimal places.

**Action thresholds:**

| Range | Action | Description |
|-------|--------|-------------|
| >= 0.85 | auto_send | Send without human review |
| 0.60 - 0.84 | agent_review | Agent must approve before sending |
| < 0.60 | escalate | Escalate to manager immediately |
| any complaint | escalate | Always escalate, regardless of score |

### Error Handling

- Zod validation errors return `400` with field-level details
- Claude API failures return `502` with a clear error message
- Uncaught exceptions return `500`

---

## Project Structure

```
├── src/
│   ├── index.ts              # Express app entry
│   ├── routes/
│   │   └── webhook.ts        # POST /webhook/message handler
│   ├── services/
│   │   ├── classifier.ts     # Query type classification
│   │   ├── confidence.ts     # Confidence scoring + action decision
│   │   └── claude.ts         # AI SDK integration
│   ├── schemas/
│   │   └── unified.ts        # Zod schemas and TypeScript types
│   └── middleware/
│       └── error.ts          # Global error handler
├── schema.sql                # PostgreSQL schema (Part 2)
├── thinking.md               # Part 3 answers
├── .env.example              # Environment variable template
├── package.json
└── tsconfig.json
```

---

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **AI SDK:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)
- **Validation:** Zod
- **Model:** claude-sonnet-4-20250514

---

## Design Decisions

### Singles Messages Table (schema.sql)

The hardest schema decision was single vs. per-channel message tables. A single table wins because the unifying premise of Nistula is that WhatsApp messages and Booking.com messages are the same thing — a guest talking to a property. Channel-specific metadata lives in a JSONB column or separate metadata table. This avoids JOIN hell when building the unified inbox and makes cross-channel queries a single index seek. See the `HARDEST DESIGN DECISION` comment in `schema.sql`.

### Regex Classifier vs. AI Classification

I chose regex-based classification (rather than using Claude to classify) because: (a) it is instant with no API cost, (b) the categories are well-defined and pattern-matching works reliably for them, and (c) it gives deterministic results for testing. The AI still generates the reply, which is where it adds value.

### Confidence Score Weights

Clarity gets the highest weight (35%) because a clear, well-formed question is the strongest signal that the AI can produce a correct reply. Source reliability gets the lowest weight (15%) because even a WhatsApp message can be perfectly answerable if the context (booking ref, property ID) is present.
