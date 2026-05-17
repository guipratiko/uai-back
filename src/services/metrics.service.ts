import { prisma } from "../lib/prisma";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  credit_card: "Cartão",
};

export async function getAdminMetrics() {
  const [tickets, eventsCount] = await Promise.all([
    prisma.issuedTicket.findMany({
      include: { order: true },
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

  const dayMap = new Map<string, { count: number; revenue: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { count: 0, revenue: 0 });
  }
  for (const t of tickets) {
    const key = t.purchasedAt.toISOString().slice(0, 10);
    if (dayMap.has(key)) {
      const cur = dayMap.get(key)!;
      cur.count += 1;
      cur.revenue += Number(t.unitPrice) + Number(t.feeAmount);
    }
  }

  const salesByDay = Array.from(dayMap.entries()).map(([key, data]) => {
    const d = new Date(key);
    const label = d.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3);
    return { label, count: data.count, revenue: data.revenue };
  });

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
    totalRevenue,
    ticketsSold: tickets.length,
    ordersCount: orderIds.size,
    eventsActive: eventsCount,
    revenueByEvent,
    salesByDay,
    paymentSplit,
  };
}
