const BASE = "http://localhost:3000";

const requests = [
  {
    name: "Input 1: Pre-sales availability with full context",
    body: {
      source: "whatsapp",
      guest_name: "Ravi",
      message: "Is the villa available on April 20th?",
      timestamp: "2025-05-14T10:00:00Z",
      booking_ref: "BR-001",
      property_id: "villa-b1",
    },
  },
  {
    name: "Input 2: Complaint with booking ref",
    body: {
      source: "booking_com",
      guest_name: "Priya",
      message: "The AC is not working in the bedroom",
      timestamp: "2025-05-14T10:00:00Z",
      booking_ref: "BR-001",
    },
  },
  {
    name: "Input 3: Vague Instagram message",
    body: {
      source: "instagram",
      guest_name: "Ananya",
      message: "hi",
      timestamp: "2025-05-14T10:00:00Z",
    },
  },
  {
    name: "Error: Missing required fields",
    body: {},
  },
];

async function main() {
  for (const { name, body } of requests) {
    console.log(`\n━━━ ${name} ━━━`);
    try {
      const res = await fetch(`${BASE}/webhook/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      console.log(`Status: ${res.status}`);
      console.log("Response:", JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      console.log("Error:", err.message);
    }
  }
}

main();
