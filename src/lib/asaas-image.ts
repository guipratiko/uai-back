/** PNG 1×1 (placeholder exigido pelo Asaas Checkout em `imageBase64`) */
export const DEFAULT_CHECKOUT_ITEM_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export function truncateItemName(name: string, max = 30): string {
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}
