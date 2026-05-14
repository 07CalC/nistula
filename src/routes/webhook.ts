import { NextFunction, Request, Response, Router } from "express";
import { ClaudeReply, inboudMessageSchema, InboundMessage, QueryType, UnifiedMessage } from "../schema/unified";
import { classifyQuery } from "../services/classifier";
import { computeConfidence, determineAction } from "../services/confidence";
import { v4 as uuidv4 } from "uuid";
import { draftClaudeReply } from "../services/claude";


const router = Router();


router.post("/message", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = inboudMessageSchema.parse(req.body) as InboundMessage
    const queryType: QueryType = classifyQuery(parsed)
    const confidence = computeConfidence(
      parsed.message,
      parsed.source,
      !!parsed.booking_ref,
      !!parsed.property_id,
      queryType
    )
    const action = determineAction(confidence, queryType)
    const unifiedMessage: UnifiedMessage = {
      message_id: uuidv4(),
      source: parsed.source,
      guest_name: parsed.guest_name,
      message_text: parsed.message,
      timestamp: parsed.timestamp,
      booking_ref: parsed.booking_ref,
      property_id: parsed.property_id,
      query_type: queryType,
    }

    const draftedReply = await draftClaudeReply(unifiedMessage)

    const reply: ClaudeReply = {
      message_id: unifiedMessage.message_id,
      query_type: queryType,
      drafted_reply: draftedReply,
      confidence_score: confidence,
      action,
    }
    res.status(200).json(reply)
  }
  catch (err) {
    next(err)
  }

})

export default router  
