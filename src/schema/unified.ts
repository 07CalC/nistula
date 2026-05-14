import { z } from "zod";


export const SOURCES = [
  "whatsapp",
  "booking_com",
  "airbnb",
  "instagram",
  "direct",
] as const


export const QUERY_TYPES = [
  "pre_sales_availability",
  "pre_sales_pricing",
  "post_sales_checkin",
  "special_request",
  "complaint",
  "general_enquiry",
] as const

export type Source = typeof SOURCES[number];
export type QueryType = typeof QUERY_TYPES[number]

export const inboudMessageSchema = z.object({
  source: z.enum(SOURCES),
  guest_name: z.string().min(1),
  message: z.string().min(1),
  timestamp: z.string().datetime(),
  // these two fields are optional becuse not all sources will provide the booking_ref and property_id 
  // also for the pre-sales messages, there won't be a booking_ref yet
  booking_ref: z.string().optional(),
  property_id: z.string().optional(),
})

export const unifiedMessageSchema = z.object({
  message_id: z.string().uuid(),
  source: z.enum(SOURCES),
  guest_name: z.string().min(1),
  message_text: z.string().min(1),
  timestamp: z.string().datetime(),
  // same as above
  booking_ref: z.string().optional(),
  property_id: z.string().optional(),

  query_type: z.enum(QUERY_TYPES),
})

export type InboundMessae = z.infer<typeof inboudMessageSchema>
export type UnifiedMessage = z.infer<typeof unifiedMessageSchema>

export type ClaudeReply = {
  message_id: string;
  query_type: QueryType;
  drafted_reply: string;
  confidence_score: number; // 0 to 1
  action: "auto_send" | "agent_review" | "escalate"

}

export interface ErrorResponse {
  error: string;
  code: string;
}


