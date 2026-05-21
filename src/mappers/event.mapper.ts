import type { Event, TicketTier } from "@prisma/client";

type EventWithTickets = Event & { tickets: TicketTier[] };

export function mapTicket(t: TicketTier) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    price: Number(t.price),
    available: t.available,
    maxPerOrder: t.maxPerOrder,
    benefits: (t.benefits as string[] | null) ?? undefined,
    sortOrder: t.sortOrder,
    lotChainId: t.lotChainId,
    status: t.status,
    activateAt: t.activateAt?.toISOString() ?? null,
    maxSales: t.maxSales,
    soldCount: t.soldCount,
    countCourtesyInCap: t.countCourtesyInCap,
  };
}

export function mapEvent(event: EventWithTickets) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle,
    category: event.category,
    date: event.date,
    endDate: event.endDate ?? undefined,
    time: event.time,
    venue: event.venue,
    address: event.address,
    city: event.city,
    state: event.state,
    image: event.image,
    bannerImage: event.bannerImage,
    description: event.description,
    highlights: event.highlights as string[],
    organizer: event.organizer,
    ageRating: event.ageRating,
    mapEmbedUrl: event.mapEmbedUrl,
    coordinates: { lat: event.lat, lng: event.lng },
    featured: event.featured,
    buyerFeePercent:
      event.buyerFeePercent != null ? Number(event.buyerFeePercent) : null,
    platformFeePercent:
      event.platformFeePercent != null ? Number(event.platformFeePercent) : null,
    allowTransfer: event.allowTransfer,
    tickets: event.tickets
      .map(mapTicket)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}
