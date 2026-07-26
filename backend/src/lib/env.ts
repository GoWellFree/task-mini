import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  port: Number(process.env.PORT ?? 3000),
  // CORS allowlist: comma-separated origins (e.g. staging + production frontends).
  frontendUrls: (process.env.FRONTEND_URL ?? "http://localhost:5173")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramBotUsername: required("TELEGRAM_BOT_USERNAME"),
  // Random, unguessable webhook path segment — never the bot token itself, so
  // leaking it (proxy logs, referrers) doesn't expose Bot API credentials.
  telegramWebhookPath: process.env.TELEGRAM_WEBHOOK_PATH,
  // Sent to Telegram via setWebhook's secret_token and checked against the
  // X-Telegram-Bot-Api-Secret-Token header on every incoming request.
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  jwtSecret: required("JWT_SECRET"),
  enableDevAuth: process.env.ENABLE_DEV_AUTH === "true",
};

if (env.isProduction && env.enableDevAuth) {
  throw new Error("ENABLE_DEV_AUTH must be false in production");
}

if (env.isProduction && (!env.telegramWebhookPath || !env.telegramWebhookSecret)) {
  throw new Error("TELEGRAM_WEBHOOK_PATH and TELEGRAM_WEBHOOK_SECRET are required in production");
}
