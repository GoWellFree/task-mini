import express from "express";
import cors from "cors";
import type { Update } from "node-telegram-bot-api";
import { env } from "./lib/env.js";
import { bot, isValidWebhookSecret, registerBotCommands, shouldProcessUpdate } from "./lib/bot.js";
import { authRouter } from "./routes/auth.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { tasksRouter, workspaceTasksRouter } from "./routes/tasks.js";

const app = express();

app.use(cors({ origin: env.frontendUrl }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/workspaces", workspacesRouter);
app.use("/api/workspaces/:workspaceId/tasks", workspaceTasksRouter);
app.use("/api/tasks", tasksRouter);

// Generic error fallback so API errors always return understandable JSON.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

registerBotCommands();

if (env.isProduction) {
  // In production Telegram pushes updates to a webhook instead of polling.
  // The path is a random secret (never the bot token) and every request must
  // also carry the correct X-Telegram-Bot-Api-Secret-Token header.
  app.post(`/webhook/${env.telegramWebhookPath}`, express.json(), (req, res) => {
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

app.listen(env.port, () => {
  console.log(`Task Mini backend listening on port ${env.port} (${env.nodeEnv})`);
});
