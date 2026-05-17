export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueSlug(base: string, existing: string[]): string {
  let slug = slugify(base);
  if (!slug) slug = "evento";
  let candidate = slug;
  let n = 1;
  while (existing.includes(candidate)) {
    candidate = `${slug}-${n++}`;
  }
  return candidate;
}
