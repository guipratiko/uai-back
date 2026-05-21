import type { IssuedTicket } from "@prisma/client";

export type TicketMapperExtras = {
  allowTransfer?: boolean;
};

export function mapIssuedTicket(t: IssuedTicket, extras?: TicketMapperExtras) {
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
    source: t.source,
    transferCount: t.transferCount,
    transferredAt: t.transferredAt?.toISOString() ?? null,
    checkedInAt: t.checkedInAt?.toISOString() ?? null,
    allowTransfer: extras?.allowTransfer ?? true,
  };
}
