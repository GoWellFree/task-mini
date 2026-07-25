import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { bot, registerBotCommands } from "./lib/bot.js";
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
  app.post(`/webhook/${env.telegramBotToken}`, express.json(), (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
}

app.listen(env.port, () => {
  console.log(`Task Mini backend listening on port ${env.port} (${env.nodeEnv})`);
});
