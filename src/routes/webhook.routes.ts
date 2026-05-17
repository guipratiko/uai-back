import { Router } from "express";
import { config } from "../config";
import { AppError } from "../lib/errors";
import * as ordersService from "../services/orders.service";
import { sendTicketsEmail } from "../services/email.service";

export const webhookRouter = Router();

type AsaasWebhookPayload = {
  id?: string;
  event?: string;
  checkout?: {
    id?: string;
    externalReference?: string;
    status?: string;
  };
};

function verifyWebhookToken(req: { headers: Record<string, string | string[] | undefined> }) {
  const expected = config.asaas.webhookToken;
  if (!expected) return;

  const token =
    (req.headers["asaas-access-token"] as string | undefined) ??
    (req.headers["access_token"] as string | undefined);

  if (token !== expected) {
    throw new AppError(401, "Token de webhook inválido");
  }
}

async function resolveOrderId(payload: AsaasWebhookPayload): Promise<string | null> {
  const externalRef = payload.checkout?.externalReference;
  if (externalRef && externalRef.startsWith("ORD-")) return externalRef;

  const checkoutId = payload.checkout?.id;
  if (!checkoutId) return null;

  const order = await ordersService.findOrderByAsaasCheckoutId(checkoutId);
  return order?.id ?? null;
}

webhookRouter.post("/v3", async (req, res, next) => {
  try {
    verifyWebhookToken(req);
    const payload = req.body as AsaasWebhookPayload;
    const event = payload.event;
    const orderId = await resolveOrderId(payload);

    if (!orderId) {
      return res.status(200).json({ received: true, ignored: true });
    }

    switch (event) {
      case "CHECKOUT_PAID": {
        const result = await ordersService.confirmPaidOrder(orderId);
        if (!result.alreadyConfirmed) {
          sendTicketsEmail(
            result.order.buyer.email,
            result.order.buyer.fullName,
            result.order.id,
            result.tickets.map((t) => ({
              code: t.code,
              eventTitle: t.eventTitle,
              eventDate: t.eventDate,
              eventTime: t.eventTime,
              venue: t.venue,
              city: t.city,
              ticketName: t.ticketName,
              qrValue: t.qrValue,
            })),
          ).catch((err) => console.error("[email] Falha ao enviar ingressos:", err));
        }
        break;
      }
      case "CHECKOUT_CANCELED":
        await ordersService.cancelPendingOrder(orderId, "cancelled");
        break;
      case "CHECKOUT_EXPIRED":
        await ordersService.cancelPendingOrder(orderId, "expired");
        break;
      case "CHECKOUT_CREATED":
        break;
      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (e) {
    next(e);
  }
});
