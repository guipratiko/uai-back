import { OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import {
  assertSingleEventCart,
  calcTotalsWithCoupon,
  MAX_COUPON_DISCOUNT_PERCENT,
  normalizeCouponCode,
} from "../lib/coupon-calc";
import {
  resolveBuyerFeePercent,
  resolvePlatformFeePercent,
} from "../lib/event-fees";
import type { CartItemInput } from "./orders.service";

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed"];

export type CouponRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  producerId: string;
  producerName: string;
  code: string;
  discountPercent: number;
  active: boolean;
  maxUses: number;
  usedCount: number;
  maxUsesPerBuyer: number;
  validFrom: string | null;
  validUntil: string | null;
  ticketTierIds: string[];
  ticketTierNames: string[];
  createdAt: string;
  updatedAt: string;
};

function mapCoupon(row: {
  id: string;
  eventId: string;
  producerId: string;
  code: string;
  discountPercent: unknown;
  active: boolean;
  maxUses: number;
  usedCount: number;
  maxUsesPerBuyer: number;
  validFrom: Date | null;
  validUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  event: { title: string };
  producer: { name: string };
  ticketTiers: { ticketTierId: string; ticketTier: { name: string } }[];
}): CouponRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: row.event.title,
    producerId: row.producerId,
    producerName: row.producer.name,
    code: row.code,
    discountPercent: Number(row.discountPercent),
    active: row.active,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    maxUsesPerBuyer: row.maxUsesPerBuyer,
    validFrom: row.validFrom?.toISOString() ?? null,
    validUntil: row.validUntil?.toISOString() ?? null,
    ticketTierIds: row.ticketTiers.map((t) => t.ticketTierId),
    ticketTierNames: row.ticketTiers.map((t) => t.ticketTier.name),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const couponInclude = {
  event: { select: { title: true } },
  producer: { select: { name: true } },
  ticketTiers: {
    include: { ticketTier: { select: { name: true, eventId: true } } },
  },
} as const;

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(400, "Data inválida");
  return d;
}

function assertDiscountPercent(percent: number) {
  if (percent <= 0 || percent > MAX_COUPON_DISCOUNT_PERCENT) {
    throw new AppError(
      400,
      `Desconto deve ser entre 1% e ${MAX_COUPON_DISCOUNT_PERCENT}%`,
    );
  }
}

async function assertTicketTiersForEvent(eventId: string, ticketTierIds: string[]) {
  if (ticketTierIds.length === 0) {
    throw new AppError(400, "Selecione ao menos um tipo de ingresso");
  }
  const tiers = await prisma.ticketTier.findMany({
    where: { id: { in: ticketTierIds }, eventId },
    select: { id: true },
  });
  if (tiers.length !== ticketTierIds.length) {
    throw new AppError(400, "Tipos de ingresso inválidos para este evento");
  }
}

async function countActiveCouponUses(couponId: string) {
  const pending = await prisma.order.count({
    where: { couponId, status: "pending" },
  });
  const coupon = await prisma.discountCoupon.findUnique({
    where: { id: couponId },
    select: { usedCount: true },
  });
  return (coupon?.usedCount ?? 0) + pending;
}

async function countBuyerCouponUses(
  couponId: string,
  buyerEmail: string,
  buyerCpf: string,
) {
  const email = buyerEmail.trim().toLowerCase();
  const cpf = buyerCpf.replace(/\D/g, "");
  return prisma.order.count({
    where: {
      couponId,
      status: { in: ACTIVE_ORDER_STATUSES },
      OR: [{ buyerEmail: email }, { buyerCpf: cpf }],
    },
  });
}

function assertCouponWindow(validFrom: Date | null, validUntil: Date | null) {
  const now = new Date();
  if (validFrom && now < validFrom) {
    throw new AppError(400, "Cupom ainda não está válido");
  }
  if (validUntil && now > validUntil) {
    throw new AppError(400, "Cupom expirado");
  }
}

export async function resolveCouponForCheckout(
  code: string,
  items: CartItemInput[],
  buyer: { email: string; cpf: string },
  options?: { skipBuyerLimit?: boolean },
) {
  let eventId: string;
  try {
    eventId = assertSingleEventCart(items);
  } catch {
    throw new AppError(
      400,
      "Cupom válido apenas quando o carrinho tem ingressos de um único evento",
    );
  }

  const normalized = normalizeCouponCode(code);
  if (!normalized) throw new AppError(400, "Informe o código do cupom");

  const coupon = await prisma.discountCoupon.findUnique({
    where: { eventId_code: { eventId, code: normalized } },
    include: couponInclude,
  });

  if (!coupon || !coupon.active) {
    throw new AppError(404, "Cupom inválido ou inativo");
  }

  assertCouponWindow(coupon.validFrom, coupon.validUntil);

  const totalUses = await countActiveCouponUses(coupon.id);
  if (totalUses >= coupon.maxUses) {
    throw new AppError(400, "Cupom esgotado");
  }

  if (!options?.skipBuyerLimit) {
    const buyerUses = await countBuyerCouponUses(coupon.id, buyer.email, buyer.cpf);
    if (buyerUses >= coupon.maxUsesPerBuyer) {
      throw new AppError(400, "Limite de uso deste cupom atingido para este comprador");
    }
  }

  const eligibleTicketIds = coupon.ticketTiers.map((t) => t.ticketTierId);
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
    discountPercent: Number(coupon.discountPercent),
    eligibleTicketIds,
  });

  if (totals.eligibleSubtotal <= 0) {
    throw new AppError(400, "Cupom não se aplica aos ingressos do carrinho");
  }

  return {
    coupon,
    totals,
    eligibleTicketIds,
  };
}

export type ValidateCouponResult = {
  valid: true;
  code: string;
  discountPercent: number;
  discountAmount: number;
  subtotal: number;
  serviceFee: number;
  platformFee: number;
  total: number;
  eligibleTicketIds: string[];
  ticketTierNames: string[];
};

export async function validateCouponForCart(
  code: string,
  items: CartItemInput[],
  buyer?: { email?: string; cpf?: string },
): Promise<ValidateCouponResult> {
  const hasBuyer = Boolean(buyer?.email?.trim() && buyer?.cpf?.replace(/\D/g, "").length);
  const { coupon, totals, eligibleTicketIds } = await resolveCouponForCheckout(
    code,
    items,
    {
      email: buyer?.email?.trim().toLowerCase() ?? "",
      cpf: buyer?.cpf?.replace(/\D/g, "") ?? "",
    },
    { skipBuyerLimit: !hasBuyer },
  );

  return {
    valid: true,
    code: coupon.code,
    discountPercent: totals.discountPercent,
    discountAmount: totals.discountAmount,
    subtotal: totals.subtotal,
    serviceFee: totals.serviceFee,
    platformFee: totals.platformFee,
    total: totals.total,
    eligibleTicketIds,
    ticketTierNames: coupon.ticketTiers.map((t) => t.ticketTier.name),
  };
}

export async function incrementCouponUsedCount(couponId: string) {
  await prisma.discountCoupon.update({
    where: { id: couponId },
    data: { usedCount: { increment: 1 } },
  });
}

export async function listCouponsAdmin(eventId?: string) {
  const rows = await prisma.discountCoupon.findMany({
    where: eventId ? { eventId } : undefined,
    orderBy: [{ createdAt: "desc" }],
    include: couponInclude,
  });
  return rows.map(mapCoupon);
}

export async function getCouponByIdAdmin(id: string) {
  const row = await prisma.discountCoupon.findUnique({
    where: { id },
    include: couponInclude,
  });
  if (!row) throw new AppError(404, "Cupom não encontrado");
  return mapCoupon(row);
}

export async function updateCouponAdmin(
  id: string,
  input: {
    code?: string;
    discountPercent?: number;
    active?: boolean;
    maxUses?: number;
    maxUsesPerBuyer?: number;
    validFrom?: string | null;
    validUntil?: string | null;
    ticketTierIds?: string[];
  },
) {
  const existing = await prisma.discountCoupon.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Cupom não encontrado");

  const code = input.code != null ? normalizeCouponCode(input.code) : undefined;
  if (code !== undefined && !code) throw new AppError(400, "Código inválido");

  if (input.discountPercent != null) assertDiscountPercent(input.discountPercent);

  if (input.maxUses != null && input.maxUses < existing.usedCount) {
    throw new AppError(400, "Limite de usos não pode ser menor que usos já confirmados");
  }

  if (input.ticketTierIds) {
    await assertTicketTiersForEvent(existing.eventId, input.ticketTierIds);
  }

  if (code && code !== existing.code) {
    const dup = await prisma.discountCoupon.findUnique({
      where: { eventId_code: { eventId: existing.eventId, code } },
    });
    if (dup) throw new AppError(400, "Já existe um cupom com este código neste evento");
  }

  const row = await prisma.$transaction(async (tx) => {
    if (input.ticketTierIds) {
      await tx.discountCouponTicketTier.deleteMany({ where: { couponId: id } });
      await tx.discountCouponTicketTier.createMany({
        data: input.ticketTierIds.map((ticketTierId) => ({
          couponId: id,
          ticketTierId,
        })),
      });
    }

    return tx.discountCoupon.update({
      where: { id },
      data: {
        code,
        discountPercent: input.discountPercent,
        active: input.active,
        maxUses: input.maxUses,
        maxUsesPerBuyer: input.maxUsesPerBuyer,
        validFrom:
          input.validFrom !== undefined ? parseOptionalDate(input.validFrom) : undefined,
        validUntil:
          input.validUntil !== undefined ? parseOptionalDate(input.validUntil) : undefined,
      },
      include: couponInclude,
    });
  });

  return mapCoupon(row);
}

export async function deleteCouponAdmin(id: string) {
  const existing = await prisma.discountCoupon.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Cupom não encontrado");
  await prisma.discountCoupon.delete({ where: { id } });
}

export async function createCouponForProducer(
  producerId: string,
  eventId: string,
  input: {
    code: string;
    discountPercent: number;
    maxUses: number;
    maxUsesPerBuyer: number;
    validFrom?: string | null;
    validUntil?: string | null;
    ticketTierIds: string[];
    active?: boolean;
  },
) {
  const link = await prisma.producerEvent.findUnique({
    where: { producerId_eventId: { producerId, eventId } },
  });
  if (!link) throw new AppError(403, "Sem acesso a este evento");

  const code = normalizeCouponCode(input.code);
  if (!code) throw new AppError(400, "Código inválido");
  assertDiscountPercent(input.discountPercent);
  if (input.maxUses < 1) throw new AppError(400, "Quantidade de cupons deve ser pelo menos 1");
  if (input.maxUsesPerBuyer < 1) {
    throw new AppError(400, "Limite por comprador deve ser pelo menos 1");
  }

  await assertTicketTiersForEvent(eventId, input.ticketTierIds);

  const dup = await prisma.discountCoupon.findUnique({
    where: { eventId_code: { eventId, code } },
  });
  if (dup) throw new AppError(400, "Já existe um cupom com este código neste evento");

  const row = await prisma.discountCoupon.create({
    data: {
      eventId,
      producerId,
      code,
      discountPercent: input.discountPercent,
      maxUses: input.maxUses,
      maxUsesPerBuyer: input.maxUsesPerBuyer,
      validFrom: parseOptionalDate(input.validFrom),
      validUntil: parseOptionalDate(input.validUntil),
      active: input.active ?? true,
      ticketTiers: {
        create: input.ticketTierIds.map((ticketTierId) => ({ ticketTierId })),
      },
    },
    include: couponInclude,
  });

  return mapCoupon(row);
}

export async function listCouponsForProducer(producerId: string, eventId: string) {
  const link = await prisma.producerEvent.findUnique({
    where: { producerId_eventId: { producerId, eventId } },
  });
  if (!link) throw new AppError(403, "Sem acesso a este evento");

  const rows = await prisma.discountCoupon.findMany({
    where: { producerId, eventId },
    orderBy: [{ createdAt: "desc" }],
    include: couponInclude,
  });
  return rows.map(mapCoupon);
}

export async function updateCouponForProducer(
  producerId: string,
  couponId: string,
  input: {
    code?: string;
    discountPercent?: number;
    active?: boolean;
    maxUses?: number;
    maxUsesPerBuyer?: number;
    validFrom?: string | null;
    validUntil?: string | null;
    ticketTierIds?: string[];
  },
) {
  const existing = await prisma.discountCoupon.findFirst({
    where: { id: couponId, producerId },
  });
  if (!existing) throw new AppError(404, "Cupom não encontrado");

  return updateCouponAdmin(couponId, input);
}

export async function deleteCouponForProducer(producerId: string, couponId: string) {
  const existing = await prisma.discountCoupon.findFirst({
    where: { id: couponId, producerId },
  });
  if (!existing) throw new AppError(404, "Cupom não encontrado");
  await prisma.discountCoupon.delete({ where: { id: couponId } });
}
