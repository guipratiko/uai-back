import type { IssuedTicket } from "@prisma/client";

export function mapIssuedTicket(t: IssuedTicket) {
  return {
    id: t.id,
    orderId: t.orderId,
    code: t.code,
    eventSlug: t.eventSlug,
    eventTitle: t.eventTitle,
    eventDate: t.eventDate,
    eventTime: t.eventTime,
    venue: t.venue,
    city: t.city,
    state: t.state,
    ticketName: t.ticketName,
    lotLabel: t.lotLabel,
    categoryLabel: t.categoryLabel,
    unitPrice: Number(t.unitPrice),
    feeAmount: Number(t.feeAmount),
    holderName: t.holderName,
    holderEmail: t.holderEmail,
    purchasedAt: t.purchasedAt.toISOString(),
    status: t.status,
    qrValue: t.qrValue,
  };
}
