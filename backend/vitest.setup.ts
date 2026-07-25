// Deterministic fake config for tests. Set before any test file imports
// modules that read `env.js` (`dotenv/config` never overrides values that
// are already present in process.env, so a real backend/.env is never
// touched by the test run).
process.env.NODE_ENV ??= "test";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.TELEGRAM_BOT_TOKEN ??= "test-bot-token-0000000000";
process.env.TELEGRAM_BOT_USERNAME ??= "test_bot";
process.env.TELEGRAM_WEBHOOK_PATH ??= "test-webhook-path";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test-webhook-secret-value";
process.env.JWT_SECRET ??= "test-jwt-secret-value-not-real";
process.env.ENABLE_DEV_AUTH ??= "true";
