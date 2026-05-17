import { PaymentMethod } from "@prisma/client";
import * as asaasService from "./asaas.service";
import * as ordersService from "./orders.service";

export async function startCheckoutSession(
  items: ordersService.CartItemInput[],
  buyer: ordersService.BuyerInput,
  paymentMethod: PaymentMethod,
  userId?: string,
) {
  const { order, serviceFee } = await ordersService.createPendingOrder(
    items,
    buyer,
    paymentMethod,
    userId,
  );

  const asaasItems = order.items.map((i) => ({
    name: `${i.eventTitle} — ${i.ticketName}`,
    description: i.eventDate,
    quantity: i.quantity,
    value: i.unitPrice,
  }));

  const { checkoutId, checkoutUrl } = await asaasService.createCheckoutSession({
    orderId: order.id,
    paymentMethod,
    buyer,
    items: asaasItems,
    serviceFee,
  });

  await ordersService.attachAsaasCheckout(order.id, checkoutId);

  return {
    orderId: order.id,
    checkoutUrl,
    checkoutId,
  };
}
