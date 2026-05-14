import { describe, it, expect, vi, beforeAll } from "vitest";
import { classifyQuery } from "../services/classifier";
import { computeConfidence, determineAction } from "../services/confidence";
import { errorHandler } from "../middleware/error";
import { ZodError } from "zod";
import { inboudMessageSchema, InboundMessage, QueryType, Source } from "../schema/unified";
import type { Request, Response, NextFunction } from "express";

vi.mock("../services/claude", () => ({
  draftClaudeReply: vi.fn().mockResolvedValue("Thank you for your message! We look forward to hosting you at Villa B1."),
}));

const buildReq = (body: unknown) => ({ body } as Request);
const buildRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};
const buildNext = () => vi.fn() as NextFunction;

describe("Services", () => {
  describe("classifyQuery", () => {
    it("classifies pre-sales availability query", () => {
      const msg: InboundMessage = {
        source: "whatsapp",
        guest_name: "Ravi",
        message: "Is the villa available on April 20th?",
        timestamp: "2025-05-14T10:00:00Z",
      };
      expect(classifyQuery(msg)).toBe("pre_sales_availability");
    });

    it("classifies complaint with booking ref", () => {
      const msg: InboundMessage = {
        source: "booking_com",
        guest_name: "Priya",
        message: "The AC is not working in the bedroom",
        timestamp: "2025-05-14T10:00:00Z",
        booking_ref: "BR-001",
      };
      expect(classifyQuery(msg)).toBe("complaint");
    });

    it("falls back to general_enquiry for vague messages", () => {
      const msg: InboundMessage = {
        source: "instagram",
        guest_name: "Ananya",
        message: "hi",
        timestamp: "2025-05-14T10:00:00Z",
      };
      expect(classifyQuery(msg)).toBe("general_enquiry");
    });
  });

  describe("computeConfidence + determineAction", () => {
    it("pre-sales availability with full context → high confidence → auto_send", () => {
      const score = computeConfidence(
        "Is the villa available on April 20th?",
        "whatsapp",
        true,
        true,
        "pre_sales_availability",
      );
      expect(score).toBeGreaterThanOrEqual(0.85);
      expect(determineAction(score, "pre_sales_availability")).toBe("auto_send");
    });

    it("complaint with booking ref → escalate even with high score", () => {
      const score = computeConfidence(
        "The AC is not working in the bedroom",
        "booking_com",
        true,
        true,
        "complaint",
      );
      expect(determineAction(score, "complaint")).toBe("escalate");
    });

    it("vague short message from Instagram → low confidence → escalate", () => {
      const score = computeConfidence(
        "hi",
        "instagram",
        false,
        false,
        "general_enquiry",
      );
      expect(score).toBeLessThan(0.6);
      expect(determineAction(score, "general_enquiry")).toBe("escalate");
    });
  });
});

describe("Error handler", () => {
  it("returns 400 with validation details for ZodError", () => {
    const res = buildRes();
    const next = buildNext();
    let zodError: ZodError;

    try {
      inboudMessageSchema.parse({});
    } catch (e) {
      zodError = e as ZodError;
    }

    errorHandler(zodError!, buildReq({}), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Validation Error",
        code: "VALIDATION_ERROR",
        details: expect.arrayContaining([
          expect.objectContaining({ path: "source", message: "Required" }),
        ]),
      }),
    );
  });

  it("returns 500 for generic errors", () => {
    const res = buildRes();
    const next = buildNext();
    const err = new Error("Something went wrong");

    errorHandler(err, buildReq({}), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Internal Server Error",
        code: "INTERNAL_SERVER_ERROR",
      }),
    );
  });
});

describe("POST /webhook/message", () => {
  it("returns drafted reply for a valid pre-sales query (input 1)", async () => {
    const { default: app } = await import("../app");
    const supertest = (await import("supertest")).default;

    const res = await supertest(app)
      .post("/webhook/message")
      .send({
        source: "whatsapp",
        guest_name: "Ravi",
        message: "Is the villa available on April 20th?",
        timestamp: "2025-05-14T10:00:00Z",
        booking_ref: "BR-001",
        property_id: "villa-b1",
      });

    expect(res.status).toBe(200);
    expect(res.body.query_type).toBe("pre_sales_availability");
    expect(res.body.action).toBe("auto_send");
    expect(res.body.confidence_score).toBeGreaterThanOrEqual(0.85);
    expect(res.body.drafted_reply).toBeTruthy();
    expect(res.body.message_id).toBeTruthy();
  });

  it("escalates a complaint with booking ref (input 2)", async () => {
    const { default: app } = await import("../app");
    const supertest = (await import("supertest")).default;

    const res = await supertest(app)
      .post("/webhook/message")
      .send({
        source: "booking_com",
        guest_name: "Priya",
        message: "The AC is not working in the bedroom",
        timestamp: "2025-05-14T10:00:00Z",
        booking_ref: "BR-001",
      });

    expect(res.status).toBe(200);
    expect(res.body.query_type).toBe("complaint");
    expect(res.body.action).toBe("escalate");
  });

  it("escalates a vague Instagram message with low confidence (input 3)", async () => {
    const { default: app } = await import("../app");
    const supertest = (await import("supertest")).default;

    const res = await supertest(app)
      .post("/webhook/message")
      .send({
        source: "instagram",
        guest_name: "Ananya",
        message: "hi",
        timestamp: "2025-05-14T10:00:00Z",
      });

    expect(res.status).toBe(200);
    expect(res.body.query_type).toBe("general_enquiry");
    expect(res.body.confidence_score).toBeLessThan(0.6);
    expect(res.body.action).toBe("escalate");
  });

  it("returns 400 for invalid payload with missing required fields (error case)", async () => {
    const { default: app } = await import("../app");
    const supertest = (await import("supertest")).default;

    const res = await supertest(app)
      .post("/webhook/message")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "Validation Error",
      code: "VALIDATION_ERROR",
    });
    expect(res.body.details.length).toBeGreaterThan(0);
  });
});
