import crypto from "node:crypto";
import TelegramBot from "node-telegram-bot-api";
import { env } from "./env.js";
import type { Task } from "../types/index.js";

// In production Telegram delivers updates via webhook (registered in index.ts).
// Locally, polling is simpler to set up. Never poll during tests — it would
// open a real long-lived connection to the Telegram API.
export const bot = new TelegramBot(env.telegramBotToken, {
  polling: !env.isProduction && !env.isTest,
});

/**
 * Constant-time check of the X-Telegram-Bot-Api-Secret-Token header Telegram
 * sends on every webhook request (configured via setWebhook's secret_token).
 * Rejects requests that don't carry the exact secret, even if the webhook
 * path itself has leaked.
 */
export function isValidWebhookSecret(headerValue: string | undefined): boolean {
  if (!env.telegramWebhookSecret || !headerValue) return false;

  const expected = Buffer.from(env.telegramWebhookSecret);
  const provided = Buffer.from(headerValue);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

// Telegram may redeliver the same update (e.g. after a slow response), so we
// keep a short-lived record of recently processed update_ids to avoid
// double-processing commands or sending duplicate notifications. A single
// Railway instance is assumed for MVP; move this to a shared store (DB/Redis)
// before scaling to multiple backend instances.
const MAX_TRACKED_UPDATE_IDS = 5000;
const processedUpdateIds = new Set<number>();

export function shouldProcessUpdate(updateId: number): boolean {
  if (processedUpdateIds.has(updateId)) return false;

  processedUpdateIds.add(updateId);
  if (processedUpdateIds.size > MAX_TRACKED_UPDATE_IDS) {
    const oldest = processedUpdateIds.values().next().value;
    if (oldest !== undefined) processedUpdateIds.delete(oldest);
  }
  return true;
}

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

export async function notifyTaskReminder(params: { telegramId: number; task: Task }): Promise<void> {
  const { telegramId, task } = params;

  const dueText = task.due_at
    ? new Date(task.due_at).toLocaleString("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "не указан";

  const text = ["Напоминание о задаче", `Задача: ${task.title}`, `Срок: ${dueText}`].join("\n");

  await bot.sendMessage(telegramId, text, {
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
