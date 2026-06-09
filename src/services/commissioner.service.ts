import { OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import {
  assertSingleEventCart,
  calcTotalsWithCoupon,
  MAX_COUPON_DISCOUNT_PERCENT,
} from "../lib/coupon-calc";
import {
  resolveBuyerFeePercent,
  resolvePlatformFeePercent,
} from "../lib/event-fees";
import type { CartItemInput, BuyerInput } from "./orders.service";

type CommissionerBuyer = Pick<BuyerInput, "email" | "cpf">;
import { issueCommissionerCourtesy } from "./commissioner-courtesy.service";

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed"];

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

const commissionerInclude = {
  user: true,
  discountTicketTiers: {
    include: { ticketTier: { select: { name: true } } },
  },
} as const;

function assertDiscountPercent(percent: number) {
  if (percent < 0 || percent > MAX_COUPON_DISCOUNT_PERCENT) {
    throw new AppError(
      400,
      `Desconto deve ser entre 0% e ${MAX_COUPON_DISCOUNT_PERCENT}%`,
    );
  }
}

function assertCommissionerWindow(validFrom: Date | null, validUntil: Date | null) {
  const now = new Date();
  if (validFrom && now < validFrom) {
    throw new AppError(400, "Link de comissário ainda não está válido");
  }
  if (validUntil && now > validUntil) {
    throw new AppError(400, "Link de comissário expirado");
  }
}

function isSelfPurchase(
  commissioner: { user: { email: string; cpf: string } },
  buyer: CommissionerBuyer,
): boolean {
  const buyerEmail = buyer.email.trim().toLowerCase();
  if (buyerEmail === commissioner.user.email.trim().toLowerCase()) return true;
  const buyerCpf = buyer.cpf.replace(/\D/g, "");
  const userCpf = commissioner.user.cpf.replace(/\D/g, "");
  return userCpf.length >= 11 && buyerCpf.length >= 11 && userCpf === buyerCpf;
}

async function countActiveCommissionerUses(commissionerId: string) {
  const pending = await prisma.order.count({
    where: { commissionerId, status: "pending" },
  });
  const row = await prisma.eventCommissioner.findUnique({
    where: { id: commissionerId },
    select: { usedCount: true },
  });
  return (row?.usedCount ?? 0) + pending;
}

async function countBuyerCommissionerUses(
  commissionerId: string,
  buyerEmail: string,
  buyerCpf: string,
) {
  const email = buyerEmail.trim().toLowerCase();
  const cpf = buyerCpf.replace(/\D/g, "");
  return prisma.order.count({
    where: {
      commissionerId,
      status: { in: ACTIVE_ORDER_STATUSES },
      discountAmount: { gt: 0 },
      OR: [{ buyerEmail: email }, { buyerCpf: cpf }],
    },
  });
}

async function findCommissionerByCode(code: string, eventId: string) {
  return prisma.eventCommissioner.findFirst({
    where: {
      eventId,
      code: normalizeCode(code),
      active: true,
    },
    include: commissionerInclude,
  });
}

export async function resolveCommissionerForCheckout(
  code: string | undefined,
  items: CartItemInput[],
  buyer: CommissionerBuyer,
  options?: { skipBuyerLimit?: boolean; requireDiscount?: boolean },
) {
  if (!code?.trim()) {
    return {
      commissionerId: null as string | null,
      totals: null,
      eligibleTicketIds: [] as string[],
      discountPercent: 0,
    };
  }

  let eventId: string;
  try {
    eventId = assertSingleEventCart(items);
  } catch {
    throw new AppError(
      400,
      "Link de comissário válido apenas com ingressos de um único evento no carrinho",
    );
  }

  const commissioner = await findCommissionerByCode(code, eventId);
  if (!commissioner) {
    return {
      commissionerId: null,
      totals: null,
      eligibleTicketIds: [],
      discountPercent: 0,
    };
  }

  assertCommissionerWindow(commissioner.validFrom, commissioner.validUntil);

  if (isSelfPurchase(commissioner, buyer)) {
    return {
      commissionerId: null,
      totals: null,
      eligibleTicketIds: [],
      discountPercent: 0,
    };
  }

  const discountPercent = Number(commissioner.discountPercent);
  if (discountPercent <= 0) {
    return {
      commissionerId: commissioner.id,
      totals: null,
      eligibleTicketIds: [],
      discountPercent: 0,
    };
  }

  if (options?.requireDiscount === false && discountPercent <= 0) {
    return {
      commissionerId: commissioner.id,
      totals: null,
      eligibleTicketIds: [],
      discountPercent: 0,
    };
  }

  const totalUses = await countActiveCommissionerUses(commissioner.id);
  if (totalUses >= commissioner.maxUses) {
    throw new AppError(400, "Desconto do comissário esgotado");
  }

  if (!options?.skipBuyerLimit) {
    const buyerUses = await countBuyerCommissionerUses(
      commissioner.id,
      buyer.email,
      buyer.cpf,
    );
    if (buyerUses >= commissioner.maxUsesPerBuyer) {
      throw new AppError(400, "Limite de uso do desconto deste comissário atingido");
    }
  }

  const eligibleTicketIds = commissioner.discountTicketTiers.map((t) => t.ticketTierId);
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { buyerFeePercent: true, platformFeePercent: true },
  });
  if (!event) throw new AppError(400, "Evento não encontrado");

  const totals = calcTotalsWithCoupon({
    items,
    buyerFeePercent: resolveBuyerFeePercent(
      event.buyerFeePercent != null ? Number(event.buyerFeePercent) : null,
    ),
    platformFeePercent: resolvePlatformFeePercent(
      event.platformFeePercent != null ? Number(event.platformFeePercent) : null,
    ),
    discountPercent,
    eligibleTicketIds,
  });

  if (totals.eligibleSubtotal <= 0) {
    throw new AppError(400, "Desconto do comissário não se aplica aos ingressos do carrinho");
  }

  return {
    commissionerId: commissioner.id,
    totals,
    eligibleTicketIds,
    discountPercent,
    commissioner,
  };
}

export type ValidateCommissionerResult = {
  valid: true;
  code: string;
  commissionerName: string;
  discountPercent: number;
  discountAmount: number;
  subtotal: number;
  serviceFee: number;
  platformFee: number;
  total: number;
  eligibleTicketIds: string[];
  ticketTierNames: string[];
  trackingOnly: boolean;
};

export async function validateCommissionerForCart(
  code: string,
  items: CartItemInput[],
  buyer?: { email?: string; cpf?: string },
): Promise<ValidateCommissionerResult> {
  const hasBuyer = Boolean(buyer?.email?.trim() && buyer?.cpf?.replace(/\D/g, "").length);
  const resolved = await resolveCommissionerForCheckout(
    code,
    items,
    {
      email: buyer?.email?.trim().toLowerCase() ?? "",
      cpf: buyer?.cpf?.replace(/\D/g, "") ?? "",
    },
    { skipBuyerLimit: !hasBuyer },
  );

  if (!resolved.commissionerId) {
    throw new AppError(404, "Link de comissário inválido ou inativo");
  }

  const commissioner = await findCommissionerByCode(code, items[0]!.eventId);
  if (!commissioner) {
    throw new AppError(404, "Link de comissário inválido ou inativo");
  }

  if (resolved.discountPercent <= 0 || !resolved.totals) {
    const event = await prisma.event.findUnique({
      where: { id: items[0]!.eventId },
      select: { buyerFeePercent: true },
    });
    let subtotal = 0;
    let serviceFee = 0;
    for (const item of items) {
      const line = item.unitPrice * item.quantity;
      subtotal += line;
      const pct = resolveBuyerFeePercent(
        event?.buyerFeePercent != null ? Number(event.buyerFeePercent) : null,
      );
      serviceFee += line * (pct / 100);
    }
    subtotal = Math.round(subtotal * 100) / 100;
    serviceFee = Math.round(serviceFee * 100) / 100;
    return {
      valid: true,
      code: commissioner.code,
      commissionerName: commissioner.user.fullName,
      discountPercent: 0,
      discountAmount: 0,
      subtotal,
      serviceFee,
      platformFee: 0,
      total: Math.round((subtotal + serviceFee) * 100) / 100,
      eligibleTicketIds: [],
      ticketTierNames: [],
      trackingOnly: true,
    };
  }

  return {
    valid: true,
    code: commissioner.code,
    commissionerName: commissioner.user.fullName,
    discountPercent: resolved.totals.discountPercent,
    discountAmount: resolved.totals.discountAmount,
    subtotal: resolved.totals.subtotal,
    serviceFee: resolved.totals.serviceFee,
    platformFee: resolved.totals.platformFee,
    total: resolved.totals.total,
    eligibleTicketIds: resolved.eligibleTicketIds,
    ticketTierNames: commissioner.discountTicketTiers.map((t) => t.ticketTier.name),
    trackingOnly: false,
  };
}

export async function incrementCommissionerUsedCount(commissionerId: string) {
  await prisma.eventCommissioner.update({
    where: { id: commissionerId },
    data: { usedCount: { increment: 1 } },
  });
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

export { assertDiscountPercent };
