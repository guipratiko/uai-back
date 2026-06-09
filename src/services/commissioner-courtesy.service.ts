import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { incrementTierSoldCount } from "./lot-rollover.service";
import { sendTicketsEmail } from "./email.service";
import type { TicketEmailData } from "../lib/ticket-email-image";

type IssueInput = {
  producerId: string;
  eventId: string;
  ticketTierId: string;
  holderName: string;
  holderEmail: string;
};

function generateOrderId() {
  return `ORD-CORT-${Date.now().toString(36).toUpperCase()}`;
}

function generateTicketCode() {
  return `TKT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function issueCommissionerCourtesy(input: IssueInput) {
  const { producerId, eventId, ticketTierId, holderName, holderEmail } = input;
  const email = holderEmail.trim().toLowerCase();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError(404, "Evento não encontrado");

  const tier = await prisma.ticketTier.findFirst({
    where: { id: ticketTierId, eventId },
  });
  if (!tier) throw new AppError(404, "Tipo de ingresso não encontrado");
  if (tier.status !== "active") {
    throw new AppError(400, "Cortesias só podem ser emitidas no lote ativo à venda");
  }
  if (tier.available < 1) {
    throw new AppError(400, "Estoque insuficiente para cortesia do comissário");
  }

  const orderId = generateOrderId();

  const ticket = await prisma.$transaction(async (tx) => {
    await tx.ticketTier.update({
      where: { id: tier.id },
      data: { available: { decrement: 1 } },
    });

    await tx.order.create({
      data: {
        id: orderId,
        buyerName: holderName.trim(),
        buyerEmail: email,
        buyerCpf: "",
        buyerPhone: "",
        paymentMethod: "pix",
        source: "courtesy",
        subtotal: 0,
        serviceFee: 0,
        platformFee: 0,
        total: 0,
        status: "confirmed",
        paidAt: new Date(),
        createdByProducerId: producerId,
        items: {
          create: {
            eventId: event.id,
            eventSlug: event.slug,
            eventTitle: event.title,
            eventDate: event.date,
            ticketId: tier.id,
            ticketName: tier.name,
            unitPrice: 0,
            quantity: 1,
          },
        },
      },
    });

    await tx.producerCourtesyLog.create({
      data: {
        producerId,
        eventId: event.id,
        ticketTierId: tier.id,
        ticketName: tier.name,
        quantity: 1,
      },
    });

    const code = generateTicketCode();
    return tx.issuedTicket.create({
      data: {
        orderId,
        code,
        eventId: event.id,
        eventSlug: event.slug,
        eventTitle: event.title,
        eventDate: event.date,
        eventTime: event.time,
        venue: event.venue,
        city: event.city,
        state: event.state,
        ticketName: tier.name,
        lotLabel: "Cortesia",
        categoryLabel: "Intransferível",
        unitPrice: 0,
        feeAmount: 0,
        holderName: holderName.trim(),
        holderEmail: email,
        status: "approved",
        source: "courtesy",
        qrValue: `UAI-${orderId}-${code}`,
        createdByProducerId: producerId,
      },
    });
  });

  await incrementTierSoldCount(tier.id, 1, "courtesy");

  const emailData: TicketEmailData = {
    code: ticket.code,
    eventTitle: ticket.eventTitle,
    eventDate: ticket.eventDate,
    eventTime: ticket.eventTime,
    venue: ticket.venue,
    city: ticket.city,
    ticketName: ticket.ticketName,
    qrValue: ticket.qrValue,
    holderName: ticket.holderName,
  };

  try {
    await sendTicketsEmail(email, holderName.trim(), orderId, [emailData]);
  } catch (e) {
    console.error("[commissioner-courtesy] falha e-mail", email, e);
  }

  return { orderId, ticketCode: ticket.code };
}
