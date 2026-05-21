import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { TicketSource, TicketTierStatus } from "@prisma/client";

function chainKey(id: string | null | undefined): string | null {
  const k = id?.trim();
  return k ? k : null;
}

/** Tipos sem cadeia (VIP, Pista…) ficam sempre à venda. */
export async function ensureParallelTiersActive(eventId: string) {
  await prisma.ticketTier.updateMany({
    where: { eventId, lotChainId: null },
    data: { status: "active" },
  });
}

async function evaluateChainRollover(eventId: string, lotChainId: string) {
  const tiers = await prisma.ticketTier.findMany({
    where: { eventId, lotChainId },
    orderBy: { sortOrder: "asc" },
  });
  if (tiers.length === 0) return;

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

export async function evaluateEventLotRollover(eventId: string) {
  await ensureParallelTiersActive(eventId);

  const chains = await prisma.ticketTier.findMany({
    where: { eventId, lotChainId: { not: null } },
    select: { lotChainId: true },
    distinct: ["lotChainId"],
  });

  for (const row of chains) {
    if (row.lotChainId) {
      await evaluateChainRollover(eventId, row.lotChainId);
    }
  }
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

  if (chainKey(tier.lotChainId)) {
    await evaluateChainRollover(tier.eventId, tier.lotChainId!);
  }
}

export function validateTierPriceAgainstPredecessor(
  tiers: {
    sortOrder: number;
    lotChainId: string | null;
    price: { toString(): string } | number;
  }[],
  sortOrder: number,
  lotChainId: string,
  newPrice: number,
) {
  const chainTiers = tiers
    .filter((t) => chainKey(t.lotChainId) === lotChainId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const previous = chainTiers
    .filter((t) => t.sortOrder < sortOrder)
    .pop();
  if (!previous) return;

  const prevPrice = Number(previous.price);
  if (newPrice <= prevPrice) {
    throw new AppError(
      400,
      `O preço deve ser maior que o lote anterior (R$ ${prevPrice.toFixed(2)})`,
    );
  }

  const first = chainTiers[0];
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
  });
  if (tiers.length === 0) return;

  const updates: Promise<unknown>[] = [];

  const parallel = tiers.filter((t) => !chainKey(t.lotChainId));
  for (const t of parallel) {
    updates.push(
      prisma.ticketTier.update({
        where: { id: t.id },
        data: { status: "active" },
      }),
    );
  }

  const chainIds = [
    ...new Set(tiers.map((t) => chainKey(t.lotChainId)).filter(Boolean)),
  ] as string[];

  for (const chainId of chainIds) {
    const chainTiers = tiers
      .filter((t) => chainKey(t.lotChainId) === chainId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    chainTiers.forEach((t, index) => {
      updates.push(
        prisma.ticketTier.update({
          where: { id: t.id },
          data: {
            status: (index === 0 ? "active" : "scheduled") as TicketTierStatus,
          },
        }),
      );
    });
  }

  await Promise.all(updates);
}
