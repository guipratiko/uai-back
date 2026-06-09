import { PaymentMethod } from "@prisma/client";
import { discountedUnitPrice } from "../lib/coupon-calc";
import * as asaasService from "./asaas.service";
import * as ordersService from "./orders.service";

export async function startCheckoutSession(
  items: ordersService.CartItemInput[],
  buyer: ordersService.BuyerInput,
  paymentMethod: PaymentMethod,
  userId?: string,
  couponCode?: string,
) {
  const { order, serviceFee, couponMeta } = await ordersService.createPendingOrder(
    items,
    buyer,
    paymentMethod,
    userId,
    couponCode,
  );

  const asaasItems = order.items.map((i) => {
    let value = i.unitPrice;
    if (
      couponMeta &&
      couponMeta.discountPercent > 0 &&
      couponMeta.eligibleTicketIds.includes(i.ticketId)
    ) {
      value = discountedUnitPrice(i.unitPrice, couponMeta.discountPercent);
    }
    return {
      name: `${i.eventTitle} — ${i.ticketName}`,
      description: i.eventDate,
      quantity: i.quantity,
      value,
    };
  });

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
