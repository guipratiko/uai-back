import { Router } from "express";
import { z } from "zod";
import * as authService from "../services/auth.service";
import { authRequired, type AuthRequest } from "../middleware/auth";
import { uploadAvatar } from "../middleware/upload-avatar";
import { AppError } from "../lib/errors";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

const genderSchema = z.enum(["male", "female", "unspecified"]);

const registerSchema = loginSchema.extend({
  fullName: z.string().min(2),
  cpf: z.string().optional(),
  phone: z.string().optional(),
  gender: genderSchema.optional().default("unspecified"),
  city: z.string().min(2),
  state: z.string().length(2),
});

const profileSchema = z.object({
  fullName: z.string().min(2).optional(),
  cpf: z.string().optional(),
  phone: z.string().optional(),
  gender: genderSchema.optional(),
  city: z.string().min(2).optional(),
  state: z.string().length(2).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(4),
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const result = await authService.register(body.email, body.password, body.fullName, {
      cpf: body.cpf,
      phone: body.phone,
      gender: body.gender,
      city: body.city,
      state: body.state,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(body.email);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(body.token, body.password);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

authRouter.get("/me", authRequired, async (req: AuthRequest, res, next) => {
  try {
    const user = await authService.getMe(req.user!.sub);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.patch("/me", authRequired, async (req: AuthRequest, res, next) => {
  try {
    const body = profileSchema.parse(req.body);
    const user = await authService.updateProfile(req.user!.sub, body);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post("/avatar", authRequired, (req: AuthRequest, res, next) => {
  uploadAvatar(req, res, async (err) => {
    if (err) return next(err instanceof AppError ? err : new AppError(400, String(err)));
    if (!req.file) return next(new AppError(400, "Nenhuma imagem enviada"));

    try {
      const user = await authService.updateAvatar(req.user!.sub, req.file.filename);
      res.json({ user });
    } catch (e) {
      next(e);
    }
  });
});

authRouter.delete("/avatar", authRequired, async (req: AuthRequest, res, next) => {
  try {
    const user = await authService.removeAvatar(req.user!.sub);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});
