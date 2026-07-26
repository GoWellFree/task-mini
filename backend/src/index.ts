import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Update } from "node-telegram-bot-api";
import { ERROR_CODES, ERROR_MESSAGES, type ApiErrorBody } from "@task-mini/shared";
import { env } from "./lib/env.js";
import { bot, isValidWebhookSecret, registerBotCommands, shouldProcessUpdate } from "./lib/bot.js";
import { errorHandler, notFoundHandler, requestId } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { tasksRouter, workspaceTasksRouter } from "./routes/tasks.js";

const REQUEST_TIMEOUT_MS = 15_000;
const JSON_BODY_LIMIT = "200kb";

const app = express();

app.use(helmet());
app.use(requestId);

// CORS allowlist (FRONTEND_URL may be a comma-separated list of origins).
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.frontendUrls.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
  }),
);

// Abort requests that hang far longer than any of our handlers should take.
app.use((req, res, next) => {
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(503).json({
        error: {
          code: ERROR_CODES.INTERNAL,
          message: "Превышено время ожидания запроса",
          requestId: req.requestId ?? "unknown",
        },
      } satisfies ApiErrorBody);
    }
  });
  next();
});

app.use(express.json({ limit: JSON_BODY_LIMIT }));

function rateLimitHandler(req: express.Request, res: express.Response): void {
  res.status(429).json({
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: ERROR_MESSAGES.RATE_LIMITED,
      requestId: req.requestId ?? "unknown",
    },
  } satisfies ApiErrorBody);
}

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  }),
);
// Auth endpoints are the entry point for brute-forcing initData/dev-auth — limit them tighter.
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/workspaces", workspacesRouter);
app.use("/api/workspaces/:workspaceId/tasks", workspaceTasksRouter);
app.use("/api/tasks", tasksRouter);

registerBotCommands();

if (env.isProduction) {
  // In production Telegram pushes updates to a webhook instead of polling.
  // The path is a random secret (never the bot token) and every request must
  // also carry the correct X-Telegram-Bot-Api-Secret-Token header.
  app.post(`/webhook/${env.telegramWebhookPath}`, (req, res) => {
    if (!isValidWebhookSecret(req.header("X-Telegram-Bot-Api-Secret-Token"))) {
      res.sendStatus(401);
      return;
    }

    const update = req.body as Update;
    if (typeof update.update_id === "number" && !shouldProcessUpdate(update.update_id)) {
      res.sendStatus(200);
      return;
    }

    bot.processUpdate(update);
    res.sendStatus(200);
  });
}

// Registered last so they see errors from every route above (including CORS rejections).
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Task Mini backend listening on port ${env.port} (${env.nodeEnv})`);
});
