



// we'll score the confidence on the basis of these factors,

import { QueryType, Source } from "../schema/unified";

// eventually we can also add user_history_similarity: how similar is the current query to the user's past queries and interactions? if a user has a history of asking about pricing, and the current query is also about pricing, then we can be more confident in the reply.
// each factor will be scored between 0 and 1, and then we can take a weighted average of the factors to get the final confidence score, the weights can be adjusted based on the importance of each factor in determining the confidence of the reply.
type ConfidenceFactors = {
  sourceReliability: number;
  queryClarity: number;
  contextCompleteness: number;
  queryComplexity: number;
}

function scoreSource(source: Source): number {
  const scores: Record<Source, number> = {
    whatsapp: 0.9,
    booking_com: 0.95,
    airbnb: 0.95,
    instagram: 0.7,
    direct: 0.8,
  }
  // default to 0.5
  return scores[source] || 0.5;
}

function scoreClarity(message: string): number {
  // base score
  // we'll add or subtract from the base score according to the query of message
  let score = 0.7

  const wordCount = message.split(/\s+/).length

  if (wordCount < 3) score -= 0.2
  if (wordCount > 5) score += 0.1
  if (wordCount > 15) score += 0.05

  // if the message contains question marks, it's more likely to be a clear query, so we can increase the score
  if (message.includes("?")) score += 1;
  if (/[A-Z]/.test(message[0])) score += 0.05 // if the message starts with a capital letter, it's more likely to be clear

  const vague = [
    /hello/i,
    /hi/i,
    /hey/i,
    /there/i,
    /ok/i,
    /okay/i,
    /hmm/i
  ]

  if (vague.some((r) => r.test(message))) score -= 0.1

  return Math.max(0.3, Math.min(1.0, score))
}

function scoreContext(
  hasBookingRef: boolean,
  hasPropertyId: boolean,
  queryType: QueryType
): number {
  let score = 0.5
  if (hasBookingRef) score += 0.25
  if (hasPropertyId) score += 0.2

  // query is a post sales checkin or complaint, but no booking ref or property id is provided, then we can be less confident in the reply because we don't have the full context of the issue
  if (
    queryType === "post_sales_checkin" ||
    queryType === "complaint"
  ) {
    if (!hasBookingRef && !hasPropertyId) score -= 0.2
  }

  return Math.max(0.2, Math.min(1.0, score))
}

function scoreComplexity(queryType: QueryType): number {
  const scores: Record<QueryType, number> = {
    pre_sales_availability: 0.9,
    pre_sales_pricing: 0.85,
    post_sales_checkin: 0.95,
    special_request: 0.7,
    complaint: 0.5,
    general_enquiry: 0.75,
  }
  return scores[queryType] || 0.5
}

export function computeConfidence(
  message: string,
  source: Source,
  hasBookingRef: boolean,
  hasPropertyId: boolean,
  queryType: QueryType
): number {
  const factors: ConfidenceFactors = {
    sourceReliability: scoreSource(source),
    queryClarity: scoreClarity(message),
    contextCompleteness: scoreContext(hasBookingRef, hasPropertyId, queryType),
    queryComplexity: scoreComplexity(queryType),
  }
  const weights = {
    sourceReliability: 0.15,
    queryClarity: 0.35,
    contextCompleteness: 0.25,
    queryComplexity: 0.25
  }

  const rawScore =
    factors.sourceReliability * weights.sourceReliability +
    factors.queryClarity * weights.queryClarity +
    factors.contextCompleteness * weights.contextCompleteness +
    factors.queryComplexity * weights.queryComplexity

  return Math.round(rawScore * 100) / 100
}

export function determineAction(
  score: number,
  queryType: QueryType,
): "auto_send" | "agent_review" | "escalate" {
  if (queryType === "complaint") return "escalate";
  if (score >= 0.85) return "auto_send";
  if (score >= 0.6) return "agent_review";
  return "escalate";
}
