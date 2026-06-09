import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CartItemInput, BuyerInput } from "./orders.service";
import { issueCommissionerCourtesy } from "./commissioner-courtesy.service";

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function resolveCommissionerId(
  code: string | undefined,
  items: CartItemInput[],
  buyer: BuyerInput,
): Promise<string | null> {
  if (!code?.trim()) return null;

  const eventIds = [...new Set(items.map((i) => i.eventId))];
  if (eventIds.length !== 1) return null;

  const eventId = eventIds[0];
  const commissioner = await prisma.eventCommissioner.findFirst({
    where: {
      eventId,
      code: normalizeCode(code),
      active: true,
    },
    include: { user: true },
  });

  if (!commissioner) return null;

  if (commissioner.validUntil && commissioner.validUntil < new Date()) {
    throw new AppError(400, "Link de comissário expirado");
  }

  const buyerEmail = buyer.email.trim().toLowerCase();
  if (buyerEmail === commissioner.user.email.trim().toLowerCase()) {
    return null;
  }

  const buyerCpf = buyer.cpf.replace(/\D/g, "");
  const userCpf = commissioner.user.cpf.replace(/\D/g, "");
  if (userCpf.length >= 11 && buyerCpf.length >= 11 && userCpf === buyerCpf) {
    return null;
  }

  return commissioner.id;
}

export async function processCommissionerAfterOrderConfirmed(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      commissioner: { include: { user: true } },
    },
  });

  if (!order?.commissionerId || !order.commissioner) return;

  const commissioner = order.commissioner;
  if (commissioner.courtesyMode !== "on_goal") return;
  if (commissioner.courtesyIssuedAt) return;
  if (!commissioner.courtesyGoal || !commissioner.courtesyTicketTierId) return;

  const salesCount = await prisma.order.count({
    where: {
      commissionerId: commissioner.id,
      status: "confirmed",
    },
  });

  if (salesCount < commissioner.courtesyGoal) return;

  await issueCommissionerCourtesy({
    producerId: commissioner.producerId,
    eventId: commissioner.eventId,
    ticketTierId: commissioner.courtesyTicketTierId,
    holderName: commissioner.user.fullName,
    holderEmail: commissioner.user.email,
  });

  await prisma.eventCommissioner.update({
    where: { id: commissioner.id },
    data: { courtesyIssuedAt: new Date() },
  });
}
