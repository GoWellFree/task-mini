import { describe, expect, it, vi } from "vitest";
import { createTaskSchema } from "@task-mini/shared";
import { ApiError } from "../lib/apiError.js";
import { errorHandler } from "./errorHandler.js";

/**
 * Regression test for a real bug: errorHandler's `err instanceof ZodError`
 * check silently failed when the ZodError it received was thrown by a
 * *different* installed copy of the zod module than the one errorHandler
 * imported its ZodError class from. npm workspaces can end up with more than
 * one copy of the same zod version on disk (one per package that declares
 * its own "zod" dependency), and `instanceof` compares class identity, not
 * version — so this only reproduces when the error genuinely comes from
 * @task-mini/shared's schemas, exactly as it does in production, rather than
 * from a ZodError constructed locally in this test file.
 */
function fakeReqRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const req = { requestId: "test-request-id", method: "POST", path: "/api/tasks" };
  const res = { headersSent: false, status };
  return { req, res, status, json };
}

describe("errorHandler", () => {
  it("renders a ZodError produced by a @task-mini/shared schema as 400 VALIDATION_FAILED", () => {
    const parseResult = createTaskSchema.safeParse({ workspaceId: "not-a-uuid" });
    expect(parseResult.success).toBe(false);
    if (parseResult.success) throw new Error("expected validation to fail");

    const { req, res, status, json } = fakeReqRes();
    errorHandler(parseResult.error, req as never, res as never, vi.fn());

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "VALIDATION_FAILED" }) }),
    );
  });

  it("renders an ApiError using its own status and code", () => {
    const { req, res, status, json } = fakeReqRes();
    errorHandler(new ApiError("TASK_NOT_FOUND"), req as never, res as never, vi.fn());

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: "TASK_NOT_FOUND" }) }),
    );
  });

  it("falls back to 500 INTERNAL for an unrecognized error without leaking its message", () => {
    const { req, res, status, json } = fakeReqRes();
    errorHandler(new Error("raw driver failure with internal details"), req as never, res as never, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0]![0];
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("raw driver failure");
  });
});
