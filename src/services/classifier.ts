import { InboundMessage, QueryType } from "../schema/unified";

//NOTE: these regex expressions are written using help of llm
//
//ENCHANCEMENT: we can use claude to classify the message instead of regex, but for now this should work for a simple prototype. The regex patterns are designed to capture common phrasings for each query type, but they can be further refined
//in prod using claude would be more reliable
const CLASSIFICATION_PATTERNS: Array<{
  type: QueryType;
  patterns: RegExp[];
}> = [
    {
      type: "pre_sales_availability",
      patterns: [
        /(?:is|it|the\s+property|villa|room).*(?:available|free|booked|vacant)/i,
        /(?:available|free|vacant).*(?:on|for|between|from|dates?|days?)/i,
        /(?:can\s+(?:I|we)\s+(?:book|stay|check\s*in)).*(?:on|for|between)/i,
      ],
    },
    {
      type: "pre_sales_pricing",
      patterns: [
        /(?:rate|price|cost|how\s+much|charges?|fee|pricing)/i,
        /(?:what\s+(?:is|are|do\s+you\s+charge)).*(?:rate|price|cost)/i,
        /(?:per\s+night|per\s+day|for\s+\d+\s+(?:adult|guest|person|night))/i,
      ],
    },
    {
      type: "post_sales_checkin",
      patterns: [
        /(?:check\s*in|check\s*out|check-in|check-out)/i,
        /(?:wifi|wi-fi|internet|password)/i,
        /(?:what\s+time|when\s+can\s+(?:I|we)|timings?|hours?)/i,
      ],
    },
    {
      type: "special_request",
      patterns: [
        /(?:early\s+(?:check\s*in|arrival)|late\s+(?:check\s*out|departure))/i,
        /(?:airport|transfer|pickup|drop|taxi|transport)/i,
        /(?:extra\s+(?:bed|guest|person|pillow|towel))/i,
        /(?:need|require|want|request|would\s+like|possible\s+to)/i,
      ],
    },
    {
      type: "complaint",
      patterns: [
        /(?:not\s+(?:working|good|happy|satisfied|acceptable))/i,
        /(?:problem|issue|broken|damage|unacceptable|unhappy)/i,
        /(?:refund|compensate|complaint|dissatisfied)/i,
        /(?:ac|air\s*condition|fan|light|water|toilet|bathroom).*(?:not|broken|issue)/i,
      ],
    },
  ];

export function classifyQuery(message: InboundMessage): QueryType {
  const text = message.message;

  if (message.booking_ref) {
    const complaintCheck = CLASSIFICATION_PATTERNS.find(
      (p) => p.type === "complaint",
    )!;
    if (complaintCheck.patterns.some((r) => r.test(text))) {
      return "complaint";
    }

    const checkinCheck = CLASSIFICATION_PATTERNS.find(
      (p) => p.type === "post_sales_checkin",
    )!;
    if (checkinCheck.patterns.some((r) => r.test(text))) {
      return "post_sales_checkin";
    }

    const specialCheck = CLASSIFICATION_PATTERNS.find(
      (p) => p.type === "special_request",
    )!;
    if (specialCheck.patterns.some((r) => r.test(text))) {
      return "special_request";
    }
  }

  for (const group of CLASSIFICATION_PATTERNS) {
    if (group.patterns.some((r) => r.test(text))) {
      return group.type;
    }
  }

  return "general_enquiry";
}
