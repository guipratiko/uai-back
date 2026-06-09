import { Router } from "express";
import { z } from "zod";
import * as couponService from "../services/coupon.service";
import { adminRequired } from "../middleware/auth";

export const couponsAdminRouter = Router();

couponsAdminRouter.use(adminRequired);

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  discountPercent: z.number().min(1).max(20).optional(),
  active: z.boolean().optional(),
  maxUses: z.number().int().min(1).optional(),
  maxUsesPerBuyer: z.number().int().min(1).optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  ticketTierIds: z.array(z.string()).min(1).optional(),
});

couponsAdminRouter.get("/", async (req, res, next) => {
  try {
    const eventId = req.query.eventId ? String(req.query.eventId) : undefined;
    const coupons = await couponService.listCouponsAdmin(eventId);
    res.json({ coupons });
  } catch (e) {
    next(e);
  }
});

couponsAdminRouter.get("/:id", async (req, res, next) => {
  try {
    const coupon = await couponService.getCouponByIdAdmin(String(req.params.id));
    res.json({ coupon });
  } catch (e) {
    next(e);
  }
});

couponsAdminRouter.put("/:id", async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const coupon = await couponService.updateCouponAdmin(String(req.params.id), body);
    res.json({ coupon });
  } catch (e) {
    next(e);
  }
});

couponsAdminRouter.delete("/:id", async (req, res, next) => {
  try {
    await couponService.deleteCouponAdmin(String(req.params.id));
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
