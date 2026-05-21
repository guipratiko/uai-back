import { OrderStatus, PaymentMethod } from "@prisma/client";
import { AppError } from "../lib/errors";
import {
  resolveBuyerFeePercent,
  resolvePlatformFeePercent,
} from "../lib/event-fees";
import { prisma } from "../lib/prisma";
import { mapIssuedTicket } from "../mappers/ticket.mapper";

export type CartItemInput = {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventDate: string;
  ticketId: string;
  ticketName: string;
  unitPrice: number;
  quantity: number;
};

export type BuyerInput = {
  fullName: string;
  email: string;
  cpf: string;
  phone: string;
};

function generateOrderId() {
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

function generateTicketCode() {
  return `TKT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function mapOrder(order: {
  id: string;
  buyerName: string;
  buyerEmail: string;
  buyerCpf: string;
  buyerPhone: string;
  paymentMethod: PaymentMethod;
  subtotal: unknown;
  serviceFee: unknown;
  platformFee: unknown;
  total: unknown;
  status: OrderStatus;
  createdAt: Date;
  paidAt: Date | null;
  items: {
    eventId: string;
    eventSlug: string;
    eventTitle: string;
    eventDate: string;
    ticketId: string;
    ticketName: string;
    unitPrice: unknown;
    quantity: number;
  }[];
}) {
  return {
    id: order.id,
    items: order.items.map((i) => ({
      eventId: i.eventId,
      eventSlug: i.eventSlug,
      eventTitle: i.eventTitle,
      eventDate: i.eventDate,
      ticketId: i.ticketId,
      ticketName: i.ticketName,
      unitPrice: Number(i.unitPrice),
      quantity: i.quantity,
    })),
    buyer: {
      fullName: order.buyerName,
      email: order.buyerEmail,
      cpf: order.buyerCpf,
      phone: order.buyerPhone,
    },
    paymentMethod: order.paymentMethod,
    subtotal: Number(order.subtotal),
    serviceFee: Number(order.serviceFee),
    platformFee: Number(order.platformFee),
    total: Number(order.total),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    status: order.status,
  };
}

async function validateCartItems(items: CartItemInput[]) {
  if (items.length === 0) throw new AppError(400, "Carrinho vazio");

  for (const item of items) {
    const tier = await prisma.ticketTier.findFirst({
      where: { id: item.ticketId, eventId: item.eventId },
    });
    if (!tier) throw new AppError(400, `Ingresso não encontrado: ${item.ticketName}`);
    if (tier.available < item.quantity) {
      throw new AppError(400, `Estoque insuficiente para ${item.ticketName}`);
    }
    if (item.quantity > tier.maxPerOrder) {
      throw new AppError(400, `Limite de ${tier.maxPerOrder} por pedido para ${item.ticketName}`);
    }
  }
}

async function calcTotals(items: CartItemInput[]) {
  const eventIds = [...new Set(items.map((i) => i.eventId))];
  const events = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    select: { id: true, buyerFeePercent: true, platformFeePercent: true },
  });
  const feesByEvent = new Map(events.map((e) => [e.id, e]));

  let subtotal = 0;
  let serviceFee = 0;
  let platformFee = 0;

  for (const item of items) {
    const ev = feesByEvent.get(item.eventId);
    const buyerPct = resolveBuyerFeePercent(
      ev?.buyerFeePercent != null ? Number(ev.buyerFeePercent) : null,
    );
    const platformPct = resolvePlatformFeePercent(
      ev?.platformFeePercent != null ? Number(ev.platformFeePercent) : null,
    );
    const line = item.unitPrice * item.quantity;
    subtotal += line;
    serviceFee += line * (buyerPct / 100);
    platformFee += line * (platformPct / 100);
  }

  subtotal = Math.round(subtotal * 100) / 100;
  serviceFee = Math.round(serviceFee * 100) / 100;
  platformFee = Math.round(platformFee * 100) / 100;
  const total = Math.round((subtotal + serviceFee) * 100) / 100;

  return { subtotal, serviceFee, platformFee, total };
}

export async function createPendingOrder(
  items: CartItemInput[],
  buyer: BuyerInput,
  paymentMethod: PaymentMethod,
  userId?: string,
) {
  await validateCartItems(items);
  const { subtotal, serviceFee, platformFee, total } = await calcTotals(items);
  const orderId = generateOrderId();
  const buyerEmail = buyer.email.trim().toLowerCase();

  const order = await prisma.order.create({
    data: {
      id: orderId,
      userId,
      buyerName: buyer.fullName.trim(),
      buyerEmail,
      buyerCpf: buyer.cpf.replace(/\D/g, ""),
      buyerPhone: buyer.phone,
      paymentMethod,
      subtotal,
      serviceFee,
      platformFee,
      total,
      status: "pending",
      items: {
        create: items.map((i) => ({
          eventId: i.eventId,
          eventSlug: i.eventSlug,
          eventTitle: i.eventTitle,
          eventDate: i.eventDate,
          ticketId: i.ticketId,
          ticketName: i.ticketName,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
        })),
      },
    },
    include: { items: true },
  });

  return { order: mapOrder(order), serviceFee };
}

export async function attachAsaasCheckout(orderId: string, asaasCheckoutId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { asaasCheckoutId },
  });
}

export async function confirmPaidOrder(orderId: string) {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, issuedTickets: true },
  });
  if (!existing) throw new AppError(404, "Pedido não encontrado");
  if (existing.status === "confirmed") {
    const tickets = await prisma.issuedTicket.findMany({ where: { orderId } });
    return {
      order: mapOrder(existing),
      tickets: tickets.map(mapIssuedTicket),
      alreadyConfirmed: true,
    };
  }
  if (existing.status !== "pending") {
    throw new AppError(400, `Pedido não pode ser confirmado (status: ${existing.status})`);
  }

  const items = existing.items.map((i) => ({
    eventId: i.eventId,
    eventSlug: i.eventSlug,
    eventTitle: i.eventTitle,
    eventDate: i.eventDate,
    ticketId: i.ticketId,
    ticketName: i.ticketName,
    unitPrice: Number(i.unitPrice),
    quantity: i.quantity,
  }));

  const ticketCount = items.reduce((s, i) => s + i.quantity, 0);
  const feePerTicket =
    ticketCount > 0 ? Number(existing.serviceFee) / ticketCount : 0;
  const buyerEmail = existing.buyerEmail;

  return prisma.$transaction(async (tx) => {
    for (const item of items) {
      const updated = await tx.ticketTier.updateMany({
        where: {
          id: item.ticketId,
          eventId: item.eventId,
          available: { gte: item.quantity },
        },
        data: { available: { decrement: item.quantity } },
      });
      if (updated.count === 0) {
        throw new AppError(400, `Estoque esgotado para ${item.ticketName}`);
      }
    }

    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: "confirmed", paidAt: new Date() },
      include: { items: true },
    });

    const issuedTickets = [];
    for (const item of items) {
      const event = await tx.event.findUnique({ where: { id: item.eventId } });
      for (let n = 0; n < item.quantity; n++) {
        const code = generateTicketCode();
        const ticket = await tx.issuedTicket.create({
          data: {
            orderId: order.id,
            code,
            eventId: item.eventId,
            eventSlug: item.eventSlug,
            eventTitle: item.eventTitle,
            eventDate: item.eventDate,
            eventTime: event?.time ?? "",
            venue: event?.venue ?? "",
            city: event?.city ?? "",
            state: event?.state ?? "",
            ticketName: item.ticketName,
            unitPrice: item.unitPrice,
            feeAmount: Math.round(feePerTicket * 100) / 100,
            holderName: existing.buyerName,
            holderEmail: buyerEmail,
            status: "approved",
            qrValue: `UAI-${order.id}-${code}`,
          },
        });
        issuedTickets.push(mapIssuedTicket(ticket));
      }
    }

    return {
      order: mapOrder(order),
      tickets: issuedTickets,
      alreadyConfirmed: false,
    };
  });
}

export async function cancelPendingOrder(orderId: string, status: "cancelled" | "expired" = "cancelled") {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "pending") return null;

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: { items: true },
  });
  return mapOrder(updated);
}

export async function findOrderByAsaasCheckoutId(asaasCheckoutId: string) {
  return prisma.order.findUnique({
    where: { asaasCheckoutId },
    include: { items: true },
  });
}

export async function getOrderById(orderId: string, email?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new AppError(404, "Pedido não encontrado");
  if (email && order.buyerEmail !== email.trim().toLowerCase()) {
    throw new AppError(403, "Acesso negado a este pedido");
  }
  return mapOrder(order);
}

export async function getTicketsByEmail(email: string) {
  const tickets = await prisma.issuedTicket.findMany({
    where: { holderEmail: email.trim().toLowerCase() },
    orderBy: { purchasedAt: "desc" },
  });
  return tickets.map(mapIssuedTicket);
}

export async function getAllTicketsForAdmin() {
  const tickets = await prisma.issuedTicket.findMany({
    orderBy: { purchasedAt: "desc" },
  });
  return tickets.map(mapIssuedTicket);
}
