import type { PaymentMethod, TicketSource, UserGender } from "@prisma/client";

export type BreakdownRow = {
  label: string;
  total: number;
  checkedIn: number;
  rate: number;
};

export type HourSlotRow = {
  label: string;
  checkedIn: number;
};

export type AttendanceScope = {
  summary: { total: number; checkedIn: number; rate: number };
  byTicketType: BreakdownRow[];
  byLot: BreakdownRow[];
  byPayment: BreakdownRow[];
  byGender: BreakdownRow[];
  byCity: BreakdownRow[];
  byState: BreakdownRow[];
  byCheckInHour: HourSlotRow[];
};

export type AttendanceReport = {
  sale: AttendanceScope;
  all: AttendanceScope;
  courtesy: AttendanceScope;
  updatedAt: string;
};

type TicketRow = {
  checkedInAt: Date | null;
  source: TicketSource;
  ticketName: string;
  lotLabel: string;
  holderEmail: string;
  paymentMethod: PaymentMethod;
  gender: UserGender | null;
  city: string | null;
  state: string | null;
};

const GENDER_LABEL: Record<UserGender, string> = {
  male: "Masculino",
  female: "Feminino",
  unspecified: "Não informado",
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: "PIX",
  credit_card: "Cartão de crédito",
};

function roundRate(checkedIn: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((checkedIn / total) * 1000) / 10;
}

function buildBreakdown(
  tickets: TicketRow[],
  keyFn: (t: TicketRow) => string,
): BreakdownRow[] {
  const map = new Map<string, { total: number; checkedIn: number }>();
  for (const t of tickets) {
    const key = keyFn(t);
    const cur = map.get(key) ?? { total: 0, checkedIn: 0 };
    cur.total += 1;
    if (t.checkedInAt) cur.checkedIn += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      total: v.total,
      checkedIn: v.checkedIn,
      rate: roundRate(v.checkedIn, v.total),
    }))
    .sort((a, b) => b.total - a.total);
}

function topCityStateBreakdown(
  tickets: TicketRow[],
  field: "city" | "state",
): BreakdownRow[] {
  const map = new Map<string, { total: number; checkedIn: number }>();
  for (const t of tickets) {
    const raw = field === "city" ? t.city : t.state;
    const key = raw?.trim() ? raw.trim() : "Não informado";
    const cur = map.get(key) ?? { total: 0, checkedIn: 0 };
    cur.total += 1;
    if (t.checkedInAt) cur.checkedIn += 1;
    map.set(key, cur);
  }

  const rows = [...map.entries()].map(([label, v]) => ({
    label,
    total: v.total,
    checkedIn: v.checkedIn,
    rate: roundRate(v.checkedIn, v.total),
  }));

  const unknown = rows.find((r) => r.label === "Não informado");
  const known = rows
    .filter((r) => r.label !== "Não informado")
    .sort((a, b) => b.total - a.total);
  const top = known.slice(0, 10);
  const rest = known.slice(10);
  if (rest.length > 0) {
    const other = rest.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        checkedIn: acc.checkedIn + r.checkedIn,
      }),
      { total: 0, checkedIn: 0 },
    );
    top.push({
      label: "Outros",
      total: other.total,
      checkedIn: other.checkedIn,
      rate: roundRate(other.checkedIn, other.total),
    });
  }
  if (unknown) top.push(unknown);
  return top.sort((a, b) => b.total - a.total);
}

function buildHourSlots(tickets: TicketRow[]): HourSlotRow[] {
  const map = new Map<string, number>();
  for (const t of tickets) {
    if (!t.checkedInAt) continue;
    const d = t.checkedInAt;
    const slot = `${String(d.getHours()).padStart(2, "0")}:${d.getMinutes() < 30 ? "00" : "30"}`;
    map.set(slot, (map.get(slot) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, checkedIn]) => ({ label, checkedIn }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function paymentLabel(t: TicketRow): string {
  if (t.source === "courtesy") return "Cortesia";
  return PAYMENT_LABEL[t.paymentMethod] ?? t.paymentMethod;
}

function buildScope(tickets: TicketRow[]): AttendanceScope {
  const total = tickets.length;
  const checkedIn = tickets.filter((t) => t.checkedInAt).length;
  return {
    summary: { total, checkedIn, rate: roundRate(checkedIn, total) },
    byTicketType: buildBreakdown(tickets, (t) => t.ticketName),
    byLot: buildBreakdown(tickets, (t) => t.lotLabel || "—"),
    byPayment: buildBreakdown(tickets, paymentLabel),
    byGender: buildBreakdown(tickets, (t) =>
      t.gender ? GENDER_LABEL[t.gender] : "Não informado",
    ),
    byCity: topCityStateBreakdown(tickets, "city"),
    byState: topCityStateBreakdown(tickets, "state"),
    byCheckInHour: buildHourSlots(tickets),
  };
}

export function buildAttendanceReport(
  raw: {
    checkedInAt: Date | null;
    source: TicketSource;
    ticketName: string;
    lotLabel: string;
    holderEmail: string;
    order: { paymentMethod: PaymentMethod };
  }[],
  usersByEmail: Map<
    string,
    { gender: UserGender; city: string; state: string }
  >,
): AttendanceReport {
  const tickets: TicketRow[] = raw.map((t) => {
    const user = usersByEmail.get(t.holderEmail.trim().toLowerCase());
    return {
      checkedInAt: t.checkedInAt,
      source: t.source,
      ticketName: t.ticketName,
      lotLabel: t.lotLabel,
      holderEmail: t.holderEmail,
      paymentMethod: t.order.paymentMethod,
      gender: user?.gender ?? null,
      city: user?.city ?? null,
      state: user?.state ?? null,
    };
  });

  const sale = tickets.filter((t) => t.source === "sale");
  const courtesy = tickets.filter((t) => t.source === "courtesy");

  return {
    sale: buildScope(sale),
    all: buildScope(tickets),
    courtesy: buildScope(courtesy),
    updatedAt: new Date().toISOString(),
  };
}
