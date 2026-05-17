import { Router } from "express";
import * as ordersService from "../services/orders.service";
import * as authService from "../services/auth.service";
import { authRequired, type AuthRequest } from "../middleware/auth";

export const ordersRouter = Router();

ordersRouter.get("/tickets/me", authRequired, async (req: AuthRequest, res, next) => {
  try {
    const user = await authService.getMe(req.user!.sub);
    const tickets = await ordersService.getTicketsByEmail(user.email);
    res.json({ tickets });
  } catch (e) {
    next(e);
  }
});

ordersRouter.get("/:orderId", async (req, res, next) => {
  try {
    const email = typeof req.query.email === "string" ? req.query.email : undefined;
    const order = await ordersService.getOrderById(String(req.params.orderId), email);
    res.json({ order });
  } catch (e) {
    next(e);
  }
});
