import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { TicketSource, TicketTierStatus } from "@prisma/client";

export async function evaluateEventLotRollover(eventId: string) {
  const tiers = await prisma.ticketTier.findMany({
    where: { eventId },
    orderBy: { sortOrder: "asc" },
  });

  const active = tiers.find((t) => t.status === "active");
  if (!active) {
    const next = tiers.find((t) => t.status === "scheduled");
    if (next) {
      await prisma.ticketTier.update({
        where: { id: next.id },
        data: { status: "active" },
      });
    }
    return;
  }

  const now = new Date();
  const hitDate = active.activateAt != null && now >= active.activateAt;
  const hitQty =
    active.maxSales != null && active.soldCount >= active.maxSales;

  if (!hitDate && !hitQty) return;

  const activeIndex = tiers.findIndex((t) => t.id === active.id);
  const next = tiers.slice(activeIndex + 1).find((t) => t.status === "scheduled");

  await prisma.$transaction([
    prisma.ticketTier.update({
      where: { id: active.id },
      data: { status: "closed" },
    }),
    ...(next
      ? [
          prisma.ticketTier.update({
            where: { id: next.id },
            data: { status: "active" },
          }),
        ]
      : []),
  ]);
}

export async function incrementTierSoldCount(
  tierId: string,
  quantity: number,
  source: TicketSource,
) {
  const tier = await prisma.ticketTier.findUnique({ where: { id: tierId } });
  if (!tier || tier.status !== "active") return;

  const counts =
    source === "courtesy" && !tier.countCourtesyInCap ? 0 : quantity;
  if (counts <= 0) return;

  await prisma.ticketTier.update({
    where: { id: tierId },
    data: { soldCount: { increment: counts } },
  });

  await evaluateEventLotRollover(tier.eventId);
}

export function validateTierPriceAgainstPredecessor(
  tiers: { sortOrder: number; price: { toString(): string } | number }[],
  sortOrder: number,
  newPrice: number,
) {
  const previous = tiers
    .filter((t) => t.sortOrder < sortOrder)
    .sort((a, b) => b.sortOrder - a.sortOrder)[0];
  if (!previous) return;

  const prevPrice = Number(previous.price);
  if (newPrice <= prevPrice) {
    throw new AppError(
      400,
      `O preço deve ser maior que o lote anterior (R$ ${prevPrice.toFixed(2)})`,
    );
  }

  const first = tiers.sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (first && sortOrder > first.sortOrder) {
    const firstPrice = Number(first.price);
    if (newPrice <= firstPrice) {
      throw new AppError(
        400,
        `O preço deve ser maior que o 1º lote (R$ ${firstPrice.toFixed(2)})`,
      );
    }
  }
}

export async function initTierStatusesForEvent(eventId: string) {
  const tiers = await prisma.ticketTier.findMany({
    where: { eventId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (tiers.length === 0) return;

  await prisma.$transaction(
    tiers.map((t, index) =>
      prisma.ticketTier.update({
        where: { id: t.id },
        data: {
          sortOrder: index,
          status: (index === 0 ? "active" : "scheduled") as TicketTierStatus,
        },
      }),
    ),
  );
}
