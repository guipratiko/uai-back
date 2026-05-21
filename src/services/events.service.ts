import { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { uniqueSlug } from "../lib/slug";
import { parseFeePercentInput } from "../lib/event-fees";
import { mapEvent } from "../mappers/event.mapper";
import {
  evaluateEventLotRollover,
  initTierStatusesForEvent,
} from "./lot-rollover.service";

const eventInclude = { tickets: true };

export async function listEvents() {
  const events = await prisma.event.findMany({
    include: eventInclude,
    orderBy: { date: "asc" },
  });
  for (const ev of events) {
    await evaluateEventLotRollover(ev.id);
  }
  const refreshed = await prisma.event.findMany({
    include: eventInclude,
    orderBy: { date: "asc" },
  });
  return refreshed.map(mapEvent);
}

export async function getEventBySlug(slug: string) {
  const event = await prisma.event.findUnique({
    where: { slug },
    include: eventInclude,
  });
  if (!event) throw new AppError(404, "Evento não encontrado");
  await evaluateEventLotRollover(event.id);
  const refreshed = await prisma.event.findUnique({
    where: { slug },
    include: eventInclude,
  });
  return mapEvent(refreshed!);
}

export async function getEventById(id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: eventInclude,
  });
  if (!event) throw new AppError(404, "Evento não encontrado");
  return mapEvent(event);
}

type TicketInput = {
  id?: string;
  name: string;
  description: string;
  price: number;
  available: number;
  maxPerOrder: number;
  benefits?: string[];
  /** Mesmo valor em vários ingressos = virada de lote. Vazio = VIP/Pista em paralelo. */
  lotChainId?: string | null;
};

type EventInput = {
  slug?: string;
  title: string;
  subtitle: string;
  category: string;
  date: string;
  endDate?: string;
  time: string;
  venue: string;
  address: string;
  city: string;
  state: string;
  image: string;
  bannerImage: string;
  description: string;
  highlights: string[];
  organizer: string;
  ageRating: string;
  mapEmbedUrl: string;
  coordinates: { lat: number; lng: number };
  featured?: boolean;
  buyerFeePercent?: number | null;
  platformFeePercent?: number | null;
  allowTransfer?: boolean;
  tickets: TicketInput[];
};

export async function createEvent(input: EventInput) {
  const existingSlugs = (await prisma.event.findMany({ select: { slug: true } })).map(
    (e) => e.slug,
  );
  const slug = input.slug
    ? uniqueSlug(input.slug, existingSlugs)
    : uniqueSlug(input.title, existingSlugs);

  const event = await prisma.event.create({
    data: {
      slug,
      title: input.title,
      subtitle: input.subtitle,
      category: input.category,
      date: input.date,
      endDate: input.endDate,
      time: input.time,
      venue: input.venue,
      address: input.address,
      city: input.city,
      state: input.state,
      image: input.image,
      bannerImage: input.bannerImage,
      description: input.description,
      highlights: input.highlights,
      organizer: input.organizer,
      ageRating: input.ageRating,
      mapEmbedUrl: input.mapEmbedUrl,
      lat: input.coordinates.lat,
      lng: input.coordinates.lng,
      featured: input.featured ?? false,
      buyerFeePercent: parseFeePercentInput(input.buyerFeePercent),
      platformFeePercent: parseFeePercentInput(input.platformFeePercent),
      allowTransfer: input.allowTransfer ?? true,
      tickets: {
        create: input.tickets.map((t, index) => ({
          name: t.name,
          description: t.description,
          price: t.price,
          available: t.available,
          maxPerOrder: t.maxPerOrder,
          benefits: t.benefits ?? Prisma.JsonNull,
          sortOrder: index,
          lotChainId: t.lotChainId?.trim() || null,
          status: "active",
        })),
      },
    },
    include: eventInclude,
  });

  await initTierStatusesForEvent(event.id);
  const refreshed = await prisma.event.findUnique({
    where: { id: event.id },
    include: eventInclude,
  });
  return mapEvent(refreshed!);
}

export async function updateEvent(id: string, input: Partial<EventInput>) {
  const current = await prisma.event.findUnique({
    where: { id },
    include: eventInclude,
  });
  if (!current) throw new AppError(404, "Evento não encontrado");

  let slug = current.slug;
  if (input.slug && input.slug !== current.slug) {
    const others = (await prisma.event.findMany({ where: { NOT: { id } }, select: { slug: true } })).map(
      (e) => e.slug,
    );
    slug = uniqueSlug(input.slug, others);
  }

  if (input.tickets) {
    await prisma.ticketTier.deleteMany({ where: { eventId: id } });
    await prisma.ticketTier.createMany({
      data: input.tickets.map((t, index) => ({
        eventId: id,
        name: t.name,
        description: t.description,
        price: t.price,
        available: t.available,
        maxPerOrder: t.maxPerOrder,
        benefits: t.benefits ?? Prisma.JsonNull,
        sortOrder: index,
        lotChainId: t.lotChainId?.trim() || null,
        status: "active",
      })),
    });
    await initTierStatusesForEvent(id);
  }

  const event = await prisma.event.update({
    where: { id },
    data: {
      slug,
      title: input.title,
      subtitle: input.subtitle,
      category: input.category,
      date: input.date,
      endDate: input.endDate,
      time: input.time,
      venue: input.venue,
      address: input.address,
      city: input.city,
      state: input.state,
      image: input.image,
      bannerImage: input.bannerImage,
      description: input.description,
      highlights: input.highlights,
      organizer: input.organizer,
      ageRating: input.ageRating,
      mapEmbedUrl: input.mapEmbedUrl,
      lat: input.coordinates?.lat,
      lng: input.coordinates?.lng,
      featured: input.featured,
      ...(input.buyerFeePercent !== undefined
        ? { buyerFeePercent: parseFeePercentInput(input.buyerFeePercent) }
        : {}),
      ...(input.platformFeePercent !== undefined
        ? { platformFeePercent: parseFeePercentInput(input.platformFeePercent) }
        : {}),
      ...(input.allowTransfer !== undefined ? { allowTransfer: input.allowTransfer } : {}),
    },
    include: eventInclude,
  });

  return mapEvent(event);
}

export async function deleteEvent(id: string) {
  await prisma.event.delete({ where: { id } });
}
