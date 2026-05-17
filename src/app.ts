import cors from "cors";
import express from "express";
import path from "path";
import { config } from "./config";
import { errorHandler } from "./middleware/error-handler";
import { ensureUploadDirs } from "./lib/upload";
import { adminRouter } from "./routes/admin.routes";
import { authRouter } from "./routes/auth.routes";
import { checkoutRouter } from "./routes/checkout.routes";
import { eventsRouter } from "./routes/events.routes";
import { ordersRouter } from "./routes/orders.routes";
import { webhookRouter } from "./routes/webhook.routes";

export function createApp() {
  const app = express();
  ensureUploadDirs();

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(path.resolve(process.cwd(), config.uploadsDir)));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "uai-tickets-api" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/checkout", checkoutRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/admin", adminRouter);
  app.use("/webhook", webhookRouter);

  app.use(errorHandler);

  return app;
}
