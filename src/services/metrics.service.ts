import { prisma } from "../lib/prisma";
import { buildSalesByDay, buildSalesByMonth, type SaleLine } from "../lib/sales-periods";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão",
};

export async function getAdminMetrics() {
  const [tickets, eventsCount] = await Promise.all([
    prisma.issuedTicket.findMany({
      where: {
        source: "sale",
        order: { status: "confirmed", paidAt: { not: null } },
      },
      select: {
        eventSlug: true,
        eventTitle: true,
        unitPrice: true,
        feeAmount: true,
        orderId: true,
        order: { select: { paidAt: true, paymentMethod: true } },
      },
    }),
    prisma.event.count(),
  ]);

  const totalRevenue = tickets.reduce(
    (s, t) => s + Number(t.unitPrice) + Number(t.feeAmount),
    0,
  );
  const orderIds = new Set(tickets.map((t) => t.orderId));

  const byEvent = new Map<string, { name: string; revenue: number; tickets: number }>();
  for (const t of tickets) {
    const cur = byEvent.get(t.eventSlug) ?? {
      name: t.eventTitle,
      revenue: 0,
      tickets: 0,
    };
    cur.revenue += Number(t.unitPrice) + Number(t.feeAmount);
    cur.tickets += 1;
    byEvent.set(t.eventSlug, cur);
  }

  const revenueByEvent = Array.from(byEvent.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const saleLines: SaleLine[] = tickets
    .filter((t) => t.order.paidAt)
    .map((t) => ({
      paidAt: t.order.paidAt!,
      tickets: 1,
      revenue: Number(t.unitPrice) + Number(t.feeAmount),
    }));

  const salesByDay = buildSalesByDay(saleLines, 30);
  const salesByMonth = buildSalesByMonth(saleLines, 12);

  const paymentMap = new Map<string, number>();
  for (const t of tickets) {
    const method = PAYMENT_LABELS[t.order.paymentMethod] ?? t.order.paymentMethod;
    paymentMap.set(method, (paymentMap.get(method) ?? 0) + 1);
  }

  const paymentSplit = Array.from(paymentMap.entries()).map(([method, count]) => ({
    method,
    count,
  }));

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    ticketsSold: tickets.length,
    ordersCount: orderIds.size,
    eventsActive: eventsCount,
    revenueByEvent,
    salesByDay,
    salesByMonth,
    paymentSplit,
  };
}
