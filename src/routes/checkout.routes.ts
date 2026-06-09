import { Router } from "express";
import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import * as authService from "../services/auth.service";
import * as checkoutService from "../services/checkout.service";
import * as couponService from "../services/coupon.service";
import { authOptional, type AuthRequest } from "../middleware/auth";

export const checkoutRouter = Router();

const cartItemSchema = z.object({
  eventId: z.string(),
  eventSlug: z.string(),
  eventTitle: z.string(),
  eventDate: z.string(),
  ticketId: z.string(),
  ticketName: z.string(),
  unitPrice: z.coerce.number(),
  quantity: z.number().int().min(1),
});

const buyerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  cpf: z.string(),
  phone: z.string(),
});

const sessionSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  buyer: buyerSchema,
  paymentMethod: z.enum(["pix", "credit_card"]),
  couponCode: z.string().optional(),
});

const validateSchema = z.object({
  code: z.string().min(1),
  items: z.array(cartItemSchema).min(1),
  buyerEmail: z.string().email().optional(),
  buyerCpf: z.string().optional(),
});

checkoutRouter.post("/coupons/validate", async (req, res, next) => {
  try {
    const body = validateSchema.parse(req.body);
    const result = await couponService.validateCouponForCart(body.code, body.items, {
      email: body.buyerEmail,
      cpf: body.buyerCpf,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

checkoutRouter.post("/session", authOptional, async (req: AuthRequest, res, next) => {
  try {
    const body = sessionSchema.parse(req.body);
    const result = await checkoutService.startCheckoutSession(
      body.items,
      body.buyer,
      body.paymentMethod as PaymentMethod,
      req.user?.sub,
      body.couponCode,
    );
    await authService.upsertFromBuyer(body.buyer);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});
