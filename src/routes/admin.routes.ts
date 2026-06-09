import { Router } from "express";
import * as metricsService from "../services/metrics.service";
import * as ordersService from "../services/orders.service";
import * as attendanceService from "../services/attendance.service";
import { adminRequired } from "../middleware/auth";

export const adminRouter = Router();

adminRouter.use(adminRequired);

adminRouter.get("/metrics", async (_req, res, next) => {
  try {
    const metrics = await metricsService.getAdminMetrics();
    res.json({ metrics });
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/events/:eventId/attendance", async (req, res, next) => {
  try {
    const report = await attendanceService.getEventAttendanceReport(String(req.params.eventId));
    res.json(report);
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/tickets", async (_req, res, next) => {
  try {
    const tickets = await ordersService.getAllTicketsForAdmin();
    res.json({ tickets });
  } catch (e) {
    next(e);
  }
});
