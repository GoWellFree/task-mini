import TelegramBot from "node-telegram-bot-api";
import { env } from "./env.js";
import type { Task } from "../types/index.js";

// In production Telegram delivers updates via webhook (registered in index.ts).
// Locally, polling is simpler to set up.
export const bot = new TelegramBot(env.telegramBotToken, {
  polling: !env.isProduction,
});

export function miniAppUrl(path = ""): string {
  return `https://t.me/${env.telegramBotUsername}/app${path}`;
}

export async function notifyTaskAssigned(params: {
  assigneeTelegramId: number;
  task: Task;
  workspaceName: string;
}): Promise<void> {
  const { assigneeTelegramId, task, workspaceName } = params;

  const dueText = task.due_at
    ? new Date(task.due_at).toLocaleString("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "не указан";

  const text = [
    "Вам назначена новая задача",
    `Задача: ${task.title}`,
    `Группа: ${workspaceName}`,
    `Срок: ${dueText}`,
  ].join("\n");

  await bot.sendMessage(assigneeTelegramId, text, {
    reply_markup: {
      inline_keyboard: [[{ text: "Открыть задачу", url: miniAppUrl(`?startapp=task_${task.id}`) }]],
    },
  });
}

export function registerBotCommands(): void {
  bot.onText(/^\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Добро пожаловать в Task Mini! Управляйте личными и командными задачами прямо в Telegram.", {
      reply_markup: {
        inline_keyboard: [[{ text: "Открыть Task Mini", url: miniAppUrl() }]],
      },
    });
  });

  bot.onText(/^\/app/, (msg) => {
    bot.sendMessage(msg.chat.id, "Открыть Task Mini:", {
      reply_markup: {
        inline_keyboard: [[{ text: "Открыть Task Mini", url: miniAppUrl() }]],
      },
    });
  });
}
