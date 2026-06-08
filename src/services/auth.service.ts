import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Role, type UserGender } from "@prisma/client";
import { config } from "../config";
import { AppError } from "../lib/errors";
import { signToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { avatarAbsoluteUrl, avatarPublicPath } from "../lib/upload";
import { removeAvatarFiles } from "../middleware/upload-avatar";
import { sendPasswordResetEmail } from "./email.service";

export async function login(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new AppError(401, "E-mail ou senha inválidos");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new AppError(401, "E-mail ou senha inválidos");

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  return { token, user: publicUser(user) };
}

export async function register(
  email: string,
  password: string,
  fullName: string,
  profile: {
    cpf?: string;
    phone?: string;
    gender?: UserGender;
    city: string;
    state: string;
  },
) {
  const normalized = email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email: normalized } });
  if (exists) throw new AppError(409, "E-mail já cadastrado");

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: normalized,
      password: hash,
      fullName: fullName.trim(),
      cpf: profile.cpf ?? "",
      phone: profile.phone ?? "",
      gender: profile.gender ?? "unspecified",
      city: profile.city.trim(),
      state: profile.state.trim().toUpperCase(),
      role: Role.USER,
    },
  });

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  return { token, user: publicUser(user) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Usuário não encontrado");
  return publicUser(user);
}

export async function updateProfile(
  userId: string,
  data: {
    fullName?: string;
    cpf?: string;
    phone?: string;
    gender?: UserGender;
    city?: string;
    state?: string;
  },
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: data.fullName?.trim(),
      cpf: data.cpf,
      phone: data.phone,
      gender: data.gender,
      city: data.city?.trim(),
      state: data.state?.trim().toUpperCase(),
    },
  });
  return publicUser(user);
}

export async function updateAvatar(userId: string, filename: string) {
  removeAvatarFiles(userId, filename);
  const relative = avatarPublicPath(filename);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: relative },
  });
  return publicUser(user);
}

export async function removeAvatar(userId: string) {
  removeAvatarFiles(userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
  });
  return publicUser(user);
}

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (user && user.role !== Role.ADMIN) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.passwordResetExpiresHours);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    await sendPasswordResetEmail(user.email, user.fullName, token);
  }

  return {
    message:
      "Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha.",
  };
}

export async function resetPassword(token: string, password: string) {
  if (password.length < 4) {
    throw new AppError(400, "A senha deve ter pelo menos 4 caracteres");
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record || record.expiresAt < new Date()) {
    throw new AppError(400, "Link inválido ou expirado. Solicite um novo e-mail.");
  }

  const hash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: record.userId },
    data: { password: hash },
  });
  await prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } });

  return { message: "Senha redefinida com sucesso. Você já pode entrar." };
}

export async function upsertFromBuyer(buyer: {
  email: string;
  fullName: string;
  cpf: string;
  phone: string;
}) {
  const normalized = buyer.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: buyer.fullName.trim() || existing.fullName,
        cpf: buyer.cpf || existing.cpf,
        phone: buyer.phone || existing.phone,
      },
    });
    return publicUser(updated);
  }

  const hash = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
  const created = await prisma.user.create({
    data: {
      email: normalized,
      password: hash,
      fullName: buyer.fullName.trim(),
      cpf: buyer.cpf,
      phone: buyer.phone,
      role: Role.USER,
    },
  });
  return publicUser(created);
}

function publicUser(user: {
  id: string;
  email: string;
  fullName: string;
  cpf: string;
  phone: string;
  gender: UserGender;
  city: string;
  state: string;
  avatarUrl: string | null;
  role: Role;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    cpf: user.cpf,
    phone: user.phone,
    gender: user.gender,
    city: user.city,
    state: user.state,
    avatarUrl: avatarAbsoluteUrl(user.avatarUrl),
    role: user.role,
  };
}

export async function ensureAdminUser() {
  const hash = await bcrypt.hash(config.adminPassword, 10);
  await prisma.user.upsert({
    where: { email: config.adminEmail },
    update: { password: hash, role: Role.ADMIN, fullName: "Administrador" },
    create: {
      email: config.adminEmail,
      password: hash,
      fullName: "Administrador",
      role: Role.ADMIN,
    },
  });
}
