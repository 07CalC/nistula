import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";


export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation Error",
      code: "VALIDATION_ERROR",
      details: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      }))
    })
    return
  }

  console.log("[error]", err);

  res.status(500).json({
    error: "Internal Server Error",
    code: "INTERNAL_SERVER_ERROR",
  })
}
