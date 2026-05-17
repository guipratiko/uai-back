import { PaymentMethod } from "@prisma/client";
import { config } from "../config";
import { AppError } from "../lib/errors";
import { DEFAULT_CHECKOUT_ITEM_IMAGE, truncateItemName } from "../lib/asaas-image";

type CheckoutItemInput = {
  name: string;
  description?: string;
  quantity: number;
  value: number;
};

type CreateCheckoutInput = {
  orderId: string;
  paymentMethod: PaymentMethod;
  buyer: {
    fullName: string;
    email: string;
    cpf: string;
    phone: string;
  };
  items: CheckoutItemInput[];
  serviceFee: number;
};

type AsaasCheckoutResponse = {
  id: string;
  link: string;
};

function asaasBillingType(method: PaymentMethod): "PIX" | "CREDIT_CARD" {
  return method === "pix" ? "PIX" : "CREDIT_CARD";
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 11) return digits;
  if (digits.length > 11) return digits.slice(-11);
  return digits;
}

function checkoutCallbacks(orderId: string) {
  const base = config.asaas.callbackBaseUrl;
  return {
    successUrl: `${base}/confirmacao?order=${encodeURIComponent(orderId)}`,
    cancelUrl: `${base}/checkout?cancelado=1`,
    expiredUrl: `${base}/checkout?expirado=1`,
  };
}

async function asaasFetch<T>(path: string, body: unknown): Promise<T> {
  if (!config.asaas.apiKey) {
    throw new AppError(500, "Integração Asaas não configurada (ASAAS_API_KEY)");
  }

  const res = await fetch(`${config.asaas.apiUrl}/v3${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.asaas.apiKey,
      "User-Agent": "UaiTickets/1.0",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as T & {
    errors?: { description: string }[];
  };

  if (!res.ok) {
    const msg =
      data.errors?.[0]?.description ??
      `Erro Asaas (${res.status})`;
    throw new AppError(400, msg);
  }

  return data;
}

export async function createCheckoutSession(input: CreateCheckoutInput) {
  const lineItems = input.items.map((item) => ({
    name: truncateItemName(item.name),
    description: (item.description ?? item.name).slice(0, 150),
    quantity: item.quantity,
    value: item.value,
    imageBase64: DEFAULT_CHECKOUT_ITEM_IMAGE,
    externalReference: input.orderId,
  }));

  if (input.serviceFee > 0) {
    lineItems.push({
      name: "Taxa de serviço",
      description: "Taxa da plataforma",
      quantity: 1,
      value: input.serviceFee,
      imageBase64: DEFAULT_CHECKOUT_ITEM_IMAGE,
      externalReference: `${input.orderId}-fee`,
    });
  }

  const phone = normalizePhone(input.buyer.phone);

  const payload = {
    billingTypes: [asaasBillingType(input.paymentMethod)],
    chargeTypes: ["DETACHED"],
    minutesToExpire: config.asaas.checkoutMinutesToExpire,
    externalReference: input.orderId,
    callback: checkoutCallbacks(input.orderId),
    items: lineItems,
    customerData: {
      name: input.buyer.fullName,
      cpfCnpj: input.buyer.cpf.replace(/\D/g, ""),
      email: input.buyer.email,
      phone,
      address: "Não informado",
      addressNumber: "S/N",
      postalCode: "30130100",
      province: "Centro",
    },
  };

  const result = await asaasFetch<AsaasCheckoutResponse>("/checkouts", payload);
  if (!result.link) throw new AppError(500, "Asaas não retornou link do checkout");

  return { checkoutId: result.id, checkoutUrl: result.link };
}
