import type { NextFunction, Request, Response } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt";
import { AppError } from "../lib/errors";

export type AuthRequest = Request & { user?: JwtPayload };

export function authOptional(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = verifyToken(header.slice(7));
    } catch {
      /* ignore invalid token */
    }
  }
  next();
}

export function authRequired(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Não autenticado"));
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    next(new AppError(401, "Token inválido ou expirado"));
  }
}

export function adminRequired(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Não autenticado"));
  }
  try {
    req.user = verifyToken(header.slice(7));
    if (req.user.role !== "ADMIN") {
      return next(new AppError(403, "Acesso restrito a administradores"));
    }
    next();
  } catch {
    next(new AppError(401, "Token inválido ou expirado"));
  }
}
