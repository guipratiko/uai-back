import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function parseCorsOrigins(): string[] {
  // Use ALLOWED_ORIGINS — alguns painéis injetam CORS_ORIGIN como header HTTP (valor inválido).
  const raw = process.env.ALLOWED_ORIGINS ?? process.env.CORS_ORIGIN ?? "";
  const fromList = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const frontend = (process.env.FRONTEND_URL ?? "http://localhost:3000").trim();
  const origins = new Set(fromList);
  if (frontend) origins.add(frontend);
  if (origins.size === 0) origins.add("http://localhost:3000");
  return [...origins];
}

export const config = {
  port: Number(process.env.PORT ?? 3333),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigins: parseCorsOrigins(),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  adminEmail: (process.env.ADMIN_EMAIL ?? "admin@uaitickets.com.br").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD ?? "U41T1K3t5@!",
  serviceFeeRate: Number(process.env.SERVICE_FEE_RATE ?? 0.1),
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:3333",
  uploadsDir: process.env.UPLOADS_DIR ?? "uploads",
  passwordResetExpiresHours: Number(process.env.PASSWORD_RESET_EXPIRES_HOURS ?? 1),
  asaas: {
    apiKey: process.env.ASAAS_API_KEY ?? "",
    apiUrl: process.env.ASAAS_API_URL ?? "https://api-sandbox.asaas.com",
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN ?? "",
    checkoutMinutesToExpire: Number(process.env.ASAAS_CHECKOUT_EXPIRE_MINUTES ?? 30),
    /** URLs de retorno do checkout (HTTPS). O Asaas rejeita localhost. */
    callbackBaseUrl: resolveAsaasCallbackBase(),
  },
  smtp: {
    enabled: process.env.SMTP_ENABLED === "true",
    debug: process.env.SMTP_DEBUG === "true",
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "noreply@uaitickets.com.br",
    fromName: process.env.EMAIL_FROM_NAME ?? "Uai Tickets",
  },
};

function resolveAsaasCallbackBase(): string {
  const override = process.env.ASAAS_CALLBACK_URL?.trim();
  if (override) return override.replace(/\/$/, "");

  const frontend = (process.env.FRONTEND_URL ?? "http://localhost:3000").trim();
  if (frontend.startsWith("https://") && !/localhost|127\.0\.0\.1/i.test(frontend)) {
    return frontend.replace(/\/$/, "");
  }

  return "https://uaitickets.com.br";
}

export function assertConfig() {
  required("DATABASE_URL");
}
