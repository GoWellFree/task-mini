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
  port: Number(process.env.PORT ?? 3000),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramBotUsername: required("TELEGRAM_BOT_USERNAME"),
  jwtSecret: required("JWT_SECRET"),
  enableDevAuth: process.env.ENABLE_DEV_AUTH === "true",
};

if (env.isProduction && env.enableDevAuth) {
  throw new Error("ENABLE_DEV_AUTH must be false in production");
}
