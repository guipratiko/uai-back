import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { mapIssuedTicket } from "../mappers/ticket.mapper";
import { sendTransferTicketEmail } from "./email.service";

const MAX_TRANSFERS = 1;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildQrValue(orderId: string, code: string, transferCount: number) {
  return `UAI-${orderId}-${code}-T${transferCount}`;
}

export async function transferTicket(
  ticketId: string,
  userId: string,
  userEmail: string,
  input: { holderName: string; holderEmail: string },
) {
  const email = normalizeEmail(userEmail);
  const newEmail = normalizeEmail(input.holderEmail);
  const newName = input.holderName.trim();

  if (newName.length < 2) {
    throw new AppError(400, "Informe o nome do novo titular");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new AppError(400, "E-mail do novo titular inválido");
  }
  if (newEmail === email) {
    throw new AppError(400, "O novo titular deve ser outro e-mail");
  }

  const ticket = await prisma.issuedTicket.findUnique({
    where: { id: ticketId },
  });
  if (!ticket) throw new AppError(404, "Ingresso não encontrado");

  if (normalizeEmail(ticket.holderEmail) !== email) {
    throw new AppError(403, "Este ingresso não pertence à sua conta");
  }

  if (ticket.source === "courtesy") {
    throw new AppError(400, "Ingressos cortesia não podem ser transferidos");
  }

  if (ticket.checkedInAt) {
    throw new AppError(400, "Ingresso já validado no check-in — transferência bloqueada");
  }

  if (ticket.status !== "approved") {
    throw new AppError(400, "Apenas ingressos aprovados podem ser transferidos");
  }

  if (ticket.transferCount >= MAX_TRANSFERS) {
    throw new AppError(400, "Este ingresso já foi transferido (limite de 1 transferência)");
  }

  const event = ticket.eventId
    ? await prisma.event.findUnique({
        where: { id: ticket.eventId },
        select: { allowTransfer: true },
      })
    : null;

  if (event && !event.allowTransfer) {
    throw new AppError(400, "Este evento não permite transferência de ingressos");
  }

  const nextTransferCount = ticket.transferCount + 1;
  const newQrValue = buildQrValue(ticket.orderId, ticket.code, nextTransferCount);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.issuedTicket.update({
      where: { id: ticketId },
      data: {
        holderName: newName,
        holderEmail: newEmail,
        qrValue: newQrValue,
        transferCount: nextTransferCount,
        transferredAt: new Date(),
      },
    });

    await tx.ticketTransfer.create({
      data: {
        ticketId: row.id,
        fromName: ticket.holderName,
        fromEmail: ticket.holderEmail,
        toName: newName,
        toEmail: newEmail,
        transferredByUserId: userId,
      },
    });

    return row;
  });

  const allowTransfer = event?.allowTransfer ?? true;

  try {
    await sendTransferTicketEmail({
      to: newEmail,
      holderName: newName,
      previousHolderName: ticket.holderName,
      ticket: {
        code: updated.code,
        eventTitle: updated.eventTitle,
        eventDate: updated.eventDate,
        eventTime: updated.eventTime,
        venue: updated.venue,
        city: updated.city,
        ticketName: updated.ticketName,
        qrValue: updated.qrValue,
        holderName: newName,
      },
    });
  } catch (e) {
    console.error("[transfer] falha ao enviar e-mail para novo titular", newEmail, e);
  }

  return mapIssuedTicket(updated, { allowTransfer });
}
