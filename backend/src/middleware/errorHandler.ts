import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ERROR_CODES, ERROR_MESSAGES, type ApiErrorBody } from "@task-mini/shared";
import { ApiError } from "../lib/apiError.js";

/** Attaches a request id used to correlate a client-visible error with the logs. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: {
      code: ERROR_CODES.ROUTE_NOT_FOUND,
      message: `Маршрут не найден: ${req.method} ${req.path}`,
      requestId: req.requestId ?? "unknown",
    },
  };
  res.status(404).json(body);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const id = req.requestId ?? "unknown";

  if (res.headersSent) return;

  if (err instanceof ApiError) {
    // Expected, handled conditions (403/404/validation) — no stack trace needed.
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, details: err.details, requestId: id },
    };
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: ERROR_MESSAGES.VALIDATION_FAILED,
        details: { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        requestId: id,
      },
    };
    res.status(400).json(body);
    return;
  }

  // Anything reaching here is a bug: log it with the id, but never leak
  // internals (stack, driver messages) to the client.
  console.error(`[${id}] Unhandled error on ${req.method} ${req.path}:`, err);
  const body: ApiErrorBody = {
    error: { code: ERROR_CODES.INTERNAL, message: ERROR_MESSAGES.INTERNAL, requestId: id },
  };
  res.status(500).json(body);
}
