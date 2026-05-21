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

const LOG_PREFIX = "[webhook]";

function log(message: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  if (data) {
    console.log(`${ts} ${LOG_PREFIX} ${message}`, data);
  } else {
    console.log(`${ts} ${LOG_PREFIX} ${message}`);
  }
}

function verifyWebhookToken(req: { headers: Record<string, string | string[] | undefined> }) {
  const expected = config.asaas.webhookToken;
  if (!expected) {
    log("AVISO: ASAAS_WEBHOOK_TOKEN não configurado — webhook aceito sem validação");
    return;
  }

  const token =
    (req.headers["asaas-access-token"] as string | undefined) ??
    (req.headers["access_token"] as string | undefined);

  if (!token) {
    log("Token ausente no header (asaas-access-token / access_token)");
    throw new AppError(401, "Token de webhook inválido");
  }

  if (token !== expected) {
    log("Token inválido");
    throw new AppError(401, "Token de webhook inválido");
  }

  log("Token validado");
}

async function resolveOrderId(payload: AsaasWebhookPayload): Promise<string | null> {
  const externalRef = payload.checkout?.externalReference;
  if (externalRef && externalRef.startsWith("ORD-")) return externalRef;

  const checkoutId = payload.checkout?.id;
  if (!checkoutId) return null;

  const order = await ordersService.findOrderByAsaasCheckoutId(checkoutId);
  return order?.id ?? null;
}

webhookRouter.get("/v3", (_req, res) => {
  res.status(200).json({
    ok: true,
    message: "Webhook Asaas ativo. Use POST com header asaas-access-token.",
    path: "/webhook/v3",
    events: ["CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED", "CHECKOUT_CREATED"],
  });
});

webhookRouter.post("/v3", async (req, res, next) => {
  const startedAt = Date.now();
  try {
    log("POST /webhook/v3 recebido", {
      contentType: req.headers["content-type"],
      userAgent: req.headers["user-agent"],
    });
    log("Payload", { body: req.body });

    verifyWebhookToken(req);
    const payload = req.body as AsaasWebhookPayload;
    const event = payload.event;
    const orderId = await resolveOrderId(payload);

    log("Evento processado", {
      event: event ?? "(sem event)",
      asaasEventId: payload.id,
      checkoutId: payload.checkout?.id,
      externalReference: payload.checkout?.externalReference,
      checkoutStatus: payload.checkout?.status,
      orderId: orderId ?? null,
    });

    if (!orderId) {
      log("Ignorado — pedido não identificado", { ms: Date.now() - startedAt });
      return res.status(200).json({ received: true, ignored: true });
    }

    switch (event) {
      case "CHECKOUT_PAID": {
        log("Confirmando pedido pago", { orderId });
        const result = await ordersService.confirmPaidOrder(orderId);
        log(
          result.alreadyConfirmed
            ? "Pedido já estava confirmado"
            : "Pedido confirmado — ingressos emitidos",
          {
            orderId,
            tickets: result.tickets.length,
            buyerEmail: result.order.buyer.email,
          },
        );
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
              holderName: t.holderName,
            })),
          )
            .then((sent) =>
              log(sent ? "E-mail de ingressos enviado" : "E-mail não enviado (SMTP off)", {
                orderId,
                to: result.order.buyer.email,
              }),
            )
            .catch((err) =>
              console.error(
                `${new Date().toISOString()} ${LOG_PREFIX} Falha ao enviar e-mail:`,
                err,
              ),
            );
        }
        break;
      }
      case "CHECKOUT_CANCELED":
        log("Cancelando pedido", { orderId });
        await ordersService.cancelPendingOrder(orderId, "cancelled");
        log("Pedido cancelado", { orderId });
        break;
      case "CHECKOUT_EXPIRED":
        log("Expirando pedido", { orderId });
        await ordersService.cancelPendingOrder(orderId, "expired");
        log("Pedido expirado", { orderId });
        break;
      case "CHECKOUT_CREATED":
        log("CHECKOUT_CREATED — nenhuma ação", { orderId });
        break;
      default:
        log("Evento não tratado", { event, orderId });
        break;
    }

    log("Resposta 200 OK", { orderId, event, ms: Date.now() - startedAt });
    res.status(200).json({ received: true });
  } catch (e) {
    log("Erro no webhook", {
      ms: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    });
    next(e);
  }
});
