import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";

export async function listOrganizers() {
  const rows = await prisma.organizer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      events: {
        include: { event: { select: { id: true, title: true, slug: true, date: true } } },
      },
    },
  });
  return rows.map(mapOrganizer);
}

export async function getOrganizerById(id: string) {
  const row = await prisma.organizer.findUnique({
    where: { id },
    include: {
      events: {
        include: { event: { select: { id: true, title: true, slug: true, date: true } } },
      },
    },
  });
  if (!row) throw new AppError(404, "Organizador não encontrado");
  return mapOrganizer(row);
}

export async function createOrganizer(input: {
  email: string;
  password: string;
  name: string;
  eventIds: string[];
}) {
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.organizer.findUnique({ where: { email } });
  if (exists) throw new AppError(409, "E-mail já cadastrado para check-in");

  if (input.eventIds.length === 0) {
    throw new AppError(400, "Vincule pelo menos um evento");
  }

  const events = await prisma.event.findMany({
    where: { id: { in: input.eventIds } },
    select: { id: true },
  });
  if (events.length !== input.eventIds.length) {
    throw new AppError(400, "Um ou mais eventos não existem");
  }

  const hash = await bcrypt.hash(input.password, 10);
  const row = await prisma.organizer.create({
    data: {
      email,
      password: hash,
      name: input.name.trim(),
      events: {
        create: input.eventIds.map((eventId) => ({ eventId })),
      },
    },
    include: {
      events: {
        include: { event: { select: { id: true, title: true, slug: true, date: true } } },
      },
    },
  });
  return mapOrganizer(row);
}

export async function updateOrganizer(
  id: string,
  input: {
    email?: string;
    password?: string;
    name?: string;
    active?: boolean;
    eventIds?: string[];
  },
) {
  const existing = await prisma.organizer.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Organizador não encontrado");

  if (input.email) {
    const email = input.email.trim().toLowerCase();
    const clash = await prisma.organizer.findFirst({
      where: { email, NOT: { id } },
    });
    if (clash) throw new AppError(409, "E-mail já em uso");
  }

  if (input.eventIds) {
    if (input.eventIds.length === 0) {
      throw new AppError(400, "Vincule pelo menos um evento");
    }
    await prisma.organizerEvent.deleteMany({ where: { organizerId: id } });
    await prisma.organizerEvent.createMany({
      data: input.eventIds.map((eventId) => ({ organizerId: id, eventId })),
    });
  }

  const row = await prisma.organizer.update({
    where: { id },
    data: {
      email: input.email?.trim().toLowerCase(),
      name: input.name?.trim(),
      active: input.active,
      ...(input.password ? { password: await bcrypt.hash(input.password, 10) } : {}),
    },
    include: {
      events: {
        include: { event: { select: { id: true, title: true, slug: true, date: true } } },
      },
    },
  });
  return mapOrganizer(row);
}

export async function deleteOrganizer(id: string) {
  await prisma.organizer.delete({ where: { id } });
}

function mapOrganizer(row: {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: Date;
  events: {
    event: { id: string; title: string; slug: string; date: string };
  }[];
}) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    events: row.events.map((e) => e.event),
  };
}
