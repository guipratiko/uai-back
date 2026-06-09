import express, { type NextFunction, type Request, type Response } from "express";
import path from "path";
import { config } from "./config";
import { errorHandler } from "./middleware/error-handler";
import { ensureUploadDirs } from "./lib/upload";
import { adminRouter } from "./routes/admin.routes";
import { organizersAdminRouter } from "./routes/organizers.admin.routes";
import { producersAdminRouter } from "./routes/producers.admin.routes";
import { authRouter } from "./routes/auth.routes";
import { checkoutRouter } from "./routes/checkout.routes";
import { eventsRouter } from "./routes/events.routes";
import { ordersRouter } from "./routes/orders.routes";
import { webhookRouter } from "./routes/webhook.routes";
import { heroSlidesRouter } from "./routes/hero-slides.routes";
import { heroSlidesAdminRouter } from "./routes/hero-slides.admin.routes";
import { couponsAdminRouter } from "./routes/coupons.admin.routes";

export function createApp() {
  const app = express();
  ensureUploadDirs();

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(path.resolve(process.cwd(), config.uploadsDir)));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "uai-tickets-api" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/hero-slides", heroSlidesRouter);
  app.use("/api/checkout", checkoutRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin/organizers", organizersAdminRouter);
  app.use("/api/admin/producers", producersAdminRouter);
  app.use("/api/admin/hero-slides", heroSlidesAdminRouter);
  app.use("/api/admin/coupons", couponsAdminRouter);
  app.use("/webhook", webhookRouter);

  app.use(errorHandler);

  return app;
}
