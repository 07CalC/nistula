# Part 3 — Thinking Question

## Question A — The Immediate Response

> "There is no hot water and we have guests arriving for breakfast in 4 hours. This is unacceptable. I want a refund for tonight."

**AI Reply:**

> "Hey Rahul, I am so sorry about the geyser acting up—I totally get how stressful this is, especially with guests showing up for breakfast soon. I’ve immediately pinged our caretaker team to prioritize this. They’ll be at the villa within 30 mins to sort it out. I’ve also escalated your refund request to our management team, and someone will call you in 15 minutes. Hang in there, we’ll get this fixed ASAP."

**Why I went with this:** Honestly, when someone is freaking out, the last thing they want is an AI sounding like a corporate robot. This reply validates their panic without getting defensive. It gives them exact ETAs (30 mins for the fix, 15 mins for a call), and smoothly passes the buck on the refund to an actual human manager instead of making promises the AI has no business making. Plus, it leaves a solid paper trail.

---

## Question B — The System Design

**Beyond just the text reply, here is how I'd wire up the backend:**

1. **Trigger the Escalation:** The model flags the `action` as "escalate" (since it's a complaint + the AI has low confidence on resolving it alone). We dump a record into an `escalations` Postgres table with `reason: "complaint_geyser"`, linked to the chat ID.
2. **Ping the On-Call Ops:** Fire off a push notification and an SMS (maybe via Fast2SMS or Twilio) to the caretaker and the duty manager. It needs to show the guest's name, villa number, and the exact angry text so they know it's serious.
3. **Log It:** The message gets logged, and we bump up a `complaint_count` counter on the property’s profile specifically for the `hot_water` tag.
4. **Follow-up Task:** Spin up a task in the ops dashboard: "Verify Villa B1 geyser by 3:45 AM and close the loop."
5. **Auto-Escalation (The strict part):** If the caretaker ghosts us and doesn't hit "Acknowledged" in 30 minutes, the system auto-escalates. It pushes the alert up the chain (Manager → Duty Manager → Ops Head), drops an SMS to the actual property owner, and logs an SLA breach. 
6. **Damage Control:** If the geyser is still dead by 5 AM (with breakfast at 7), the system auto-drafts a message offering a 50% refund, queued up for the manager’s 1-click approval. You gotta get ahead of the bad review!

---

## Question C — The Learning

Look, if Villa B1 has hot water issues three times in two months, that's not bad luck the hardware is busted. The system needs to catch this:

1. **Tag & Track:** Every escalation gets tagged (e.g., `geyser`, `ac_not_cooling`, `noise`). I'd keep a `JSONB` column in the `properties` table to aggregate these complaint counts over time.
2. **Auto-Generate Tickets:** Once a tag hits a limit (like 2 strikes in 60 days), the backend auto-generates a maintenance ticket: "Villa B1 has had 3 geyser complaints recently. Send a plumber ASAP for a full inspection."
3. **Blockers for Next Check-in:** Before the next poor guy checks into Villa B1, the system checks open tickets. It flags the ops team: "Hey, geyser was acting up last time. Verify it's fixed before they check in."
4. **Guest Heads-up:** If the fix is taking time, surface it in the booking flow before they arrive: "Hey, we're doing some quick maintenance on the water heater before you arrive to make sure everything is perfect."

**How I'd actually build it:** I'd spin up a `property_incident_patterns` table and run a nightly cron job or background worker (probably in Go for very small footprint). It would group escalations by `property_id` + `tag` over a rolling 90-day window. When the count trips the threshold, it fires an alert to the property manager. We could even track the mean-time-to-resolve for each tag to figure out if our plumber is just slacking or if the geyser model itself is trash. 

Basically, turning the whole system from reactive (putting out fires) to preventive (fixing the geyser before the next guest even packs their bags).
