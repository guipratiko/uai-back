export type SalesPeriodRow = {
  key: string;
  label: string;
  tickets: number;
  revenue: number;
};

export type SaleLine = {
  paidAt: Date;
  tickets: number;
  revenue: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function buildSalesByDay(lines: SaleLine[], days = 30): SalesPeriodRow[] {
  const map = new Map<string, { tickets: number; revenue: number }>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map.set(dateKey(d), { tickets: 0, revenue: 0 });
  }
  for (const line of lines) {
    const key = dateKey(line.paidAt);
    if (!map.has(key)) continue;
    const cur = map.get(key)!;
    cur.tickets += line.tickets;
    cur.revenue += line.revenue;
  }
  return [...map.entries()].map(([key, data]) => {
    const d = new Date(`${key}T12:00:00`);
    return {
      key,
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      tickets: data.tickets,
      revenue: roundMoney(data.revenue),
    };
  });
}

export function buildSalesByMonth(lines: SaleLine[], months = 12): SalesPeriodRow[] {
  const map = new Map<string, { tickets: number; revenue: number }>();
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    map.set(monthKey(d), { tickets: 0, revenue: 0 });
  }
  for (const line of lines) {
    const key = monthKey(line.paidAt);
    if (!map.has(key)) continue;
    const cur = map.get(key)!;
    cur.tickets += line.tickets;
    cur.revenue += line.revenue;
  }
  return [...map.entries()].map(([key, data]) => {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return {
      key,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      tickets: data.tickets,
      revenue: roundMoney(data.revenue),
    };
  });
}
