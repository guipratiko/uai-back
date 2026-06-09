import type { CartItemInput } from "../services/orders.service";

export const MAX_COUPON_DISCOUNT_PERCENT = 20;

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type CouponTotalsInput = {
  items: CartItemInput[];
  buyerFeePercent: number;
  platformFeePercent: number;
  discountPercent: number;
  eligibleTicketIds: string[];
};

export type CouponTotalsResult = {
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  serviceFee: number;
  platformFee: number;
  total: number;
  eligibleSubtotal: number;
};

export function calcTotalsWithCoupon(input: CouponTotalsInput): CouponTotalsResult {
  let subtotal = 0;
  let eligibleSubtotal = 0;

  for (const item of input.items) {
    const line = item.unitPrice * item.quantity;
    subtotal += line;
    if (input.eligibleTicketIds.includes(item.ticketId)) {
      eligibleSubtotal += line;
    }
  }

  subtotal = roundMoney(subtotal);
  eligibleSubtotal = roundMoney(eligibleSubtotal);

  const discountAmount = roundMoney(eligibleSubtotal * (input.discountPercent / 100));
  const subtotalAfterDiscount = roundMoney(subtotal - discountAmount);
  const serviceFee = roundMoney(subtotalAfterDiscount * (input.buyerFeePercent / 100));
  const platformFee = roundMoney(subtotal * (input.platformFeePercent / 100));
  const total = roundMoney(subtotalAfterDiscount + serviceFee);

  return {
    subtotal,
    discountAmount,
    discountPercent: input.discountPercent,
    serviceFee,
    platformFee,
    total,
    eligibleSubtotal,
  };
}

/** Preço unitário com desconto para envio ao Asaas (somente tiers elegíveis). */
export function discountedUnitPrice(unitPrice: number, discountPercent: number): number {
  return roundMoney(unitPrice * (1 - discountPercent / 100));
}

export function assertSingleEventCart(items: CartItemInput[]): string {
  const eventIds = [...new Set(items.map((i) => i.eventId))];
  if (eventIds.length !== 1) {
    throw new Error("CUPOM_MULTI_EVENT");
  }
  return eventIds[0]!;
}
