import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { buildAttendanceReport } from "../lib/attendance-breakdown";

export async function getEventAttendanceReport(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError(404, "Evento não encontrado");

  const where = {
    status: "approved" as const,
    OR: [{ eventId }, { eventSlug: event.slug }],
  };

  const ticketRows = await prisma.issuedTicket.findMany({
    where,
    select: {
      checkedInAt: true,
      source: true,
      ticketName: true,
      lotLabel: true,
      holderEmail: true,
      order: { select: { paymentMethod: true } },
    },
  });

  const emails = [...new Set(ticketRows.map((t) => t.holderEmail.trim().toLowerCase()))];
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true, gender: true, city: true, state: true },
  });
  const usersByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  const attendance = buildAttendanceReport(ticketRows, usersByEmail);

  return {
    eventId: event.id,
    eventTitle: event.title,
    attendance,
  };
}
