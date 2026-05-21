import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";

export async function listProducers() {
  const rows = await prisma.producer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      events: {
        include: { event: { select: { id: true, title: true, slug: true, date: true } } },
      },
      _count: { select: { courtesyLogs: true } },
    },
  });
  return rows.map(mapProducer);
}

export async function getProducerById(id: string) {
  const row = await prisma.producer.findUnique({
    where: { id },
    include: {
      events: {
        include: { event: { select: { id: true, title: true, slug: true, date: true } } },
      },
      _count: { select: { courtesyLogs: true } },
    },
  });
  if (!row) throw new AppError(404, "Produtor não encontrado");
  return mapProducer(row);
}

export async function createProducer(input: {
  email: string;
  password: string;
  name: string;
  eventIds: string[];
}) {
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.producer.findUnique({ where: { email } });
  if (exists) throw new AppError(409, "E-mail já cadastrado para produtor");

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
  const row = await prisma.producer.create({
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
      _count: { select: { courtesyLogs: true } },
    },
  });
  return mapProducer(row);
}

export async function updateProducer(
  id: string,
  input: {
    email?: string;
    password?: string;
    name?: string;
    active?: boolean;
    eventIds?: string[];
  },
) {
  const existing = await prisma.producer.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Produtor não encontrado");

  if (input.email) {
    const email = input.email.trim().toLowerCase();
    const clash = await prisma.producer.findFirst({
      where: { email, NOT: { id } },
    });
    if (clash) throw new AppError(409, "E-mail já em uso");
  }

  if (input.eventIds) {
    if (input.eventIds.length === 0) {
      throw new AppError(400, "Vincule pelo menos um evento");
    }
    await prisma.producerEvent.deleteMany({ where: { producerId: id } });
    await prisma.producerEvent.createMany({
      data: input.eventIds.map((eventId) => ({ producerId: id, eventId })),
    });
  }

  const row = await prisma.producer.update({
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
      _count: { select: { courtesyLogs: true } },
    },
  });
  return mapProducer(row);
}

export async function deleteProducer(id: string) {
  await prisma.producer.delete({ where: { id } });
}

function mapProducer(row: {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: Date;
  events: { event: { id: string; title: string; slug: string; date: string } }[];
  _count: { courtesyLogs: number };
}) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    courtesyTicketsIssued: row._count.courtesyLogs,
    events: row.events.map((e) => e.event),
  };
}
