import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import {
  assetAbsoluteUrl,
  deleteLocalUpload,
  heroPublicPath,
  isLocalUpload,
} from "../lib/upload";

function resolveImageInput(
  uploadedFilename: string | undefined,
  urlField: string | undefined,
  currentValue: string | undefined,
  label: string,
  required: boolean,
): string {
  if (uploadedFilename) {
    return heroPublicPath(uploadedFilename);
  }
  const url = urlField?.trim();
  if (url) {
    if (!/^https?:\/\//i.test(url)) {
      throw new AppError(400, `${label}: informe uma URL válida (http/https)`);
    }
    return url;
  }
  if (currentValue) return currentValue;
  if (required) throw new AppError(400, `${label} é obrigatório (arquivo ou URL)`);
  return "";
}

function mapSlide(row: {
  id: string;
  eventId: string;
  title: string;
  subtitle: string;
  imageDesktop: string;
  imageMobile: string;
  displayDurationMs: number;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  event: { id: string; slug: string; title: string };
}) {
  return {
    id: row.id,
    eventId: row.eventId,
    eventSlug: row.event.slug,
    eventTitle: row.event.title,
    title: row.title,
    subtitle: row.subtitle,
    imageDesktop: row.imageDesktop,
    imageMobile: row.imageMobile,
    imageDesktopUrl: assetAbsoluteUrl(row.imageDesktop)!,
    imageMobileUrl: assetAbsoluteUrl(row.imageMobile)!,
    displayDurationMs: row.displayDurationMs,
    sortOrder: row.sortOrder,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const includeEvent = {
  event: { select: { id: true, slug: true, title: true } },
};

export async function listPublicHeroSlides() {
  const rows = await prisma.heroSlide.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: includeEvent,
  });
  return rows.map(mapSlide);
}

export async function listAdminHeroSlides() {
  const rows = await prisma.heroSlide.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: includeEvent,
  });
  return rows.map(mapSlide);
}

export async function getHeroSlideById(id: string) {
  const row = await prisma.heroSlide.findUnique({
    where: { id },
    include: includeEvent,
  });
  if (!row) throw new AppError(404, "Banner não encontrado");
  return mapSlide(row);
}

export async function createHeroSlide(input: {
  eventId: string;
  title: string;
  subtitle: string;
  displayDurationMs: number;
  sortOrder: number;
  active: boolean;
  desktopFile?: string;
  mobileFile?: string;
  imageDesktopUrl?: string;
  imageMobileUrl?: string;
}) {
  const event = await prisma.event.findUnique({ where: { id: input.eventId } });
  if (!event) throw new AppError(400, "Evento não encontrado");

  const imageDesktop = resolveImageInput(
    input.desktopFile,
    input.imageDesktopUrl,
    undefined,
    "Imagem desktop",
    true,
  );
  const imageMobile = resolveImageInput(
    input.mobileFile,
    input.imageMobileUrl,
    undefined,
    "Imagem mobile",
    true,
  );

  const row = await prisma.heroSlide.create({
    data: {
      eventId: input.eventId,
      title: input.title.trim(),
      subtitle: input.subtitle.trim(),
      imageDesktop,
      imageMobile,
      displayDurationMs: input.displayDurationMs,
      sortOrder: input.sortOrder,
      active: input.active,
    },
    include: includeEvent,
  });
  return mapSlide(row);
}

export async function updateHeroSlide(
  id: string,
  input: {
    eventId?: string;
    title?: string;
    subtitle?: string;
    displayDurationMs?: number;
    sortOrder?: number;
    active?: boolean;
    desktopFile?: string;
    mobileFile?: string;
    imageDesktopUrl?: string;
    imageMobileUrl?: string;
  },
) {
  const existing = await prisma.heroSlide.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Banner não encontrado");

  if (input.eventId) {
    const event = await prisma.event.findUnique({ where: { id: input.eventId } });
    if (!event) throw new AppError(400, "Evento não encontrado");
  }

  let imageDesktop = existing.imageDesktop;
  let imageMobile = existing.imageMobile;

  if (input.desktopFile || input.imageDesktopUrl !== undefined) {
    const nextDesktop = resolveImageInput(
      input.desktopFile,
      input.imageDesktopUrl,
      existing.imageDesktop,
      "Imagem desktop",
      false,
    );
    if (nextDesktop && nextDesktop !== existing.imageDesktop) {
      if (isLocalUpload(existing.imageDesktop)) deleteLocalUpload(existing.imageDesktop);
      imageDesktop = nextDesktop;
    }
  }

  if (input.mobileFile || input.imageMobileUrl !== undefined) {
    const nextMobile = resolveImageInput(
      input.mobileFile,
      input.imageMobileUrl,
      existing.imageMobile,
      "Imagem mobile",
      false,
    );
    if (nextMobile && nextMobile !== existing.imageMobile) {
      if (isLocalUpload(existing.imageMobile)) deleteLocalUpload(existing.imageMobile);
      imageMobile = nextMobile;
    }
  }

  const row = await prisma.heroSlide.update({
    where: { id },
    data: {
      eventId: input.eventId,
      title: input.title?.trim(),
      subtitle: input.subtitle?.trim(),
      imageDesktop,
      imageMobile,
      displayDurationMs: input.displayDurationMs,
      sortOrder: input.sortOrder,
      active: input.active,
    },
    include: includeEvent,
  });
  return mapSlide(row);
}

export async function deleteHeroSlide(id: string) {
  const existing = await prisma.heroSlide.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Banner não encontrado");

  deleteLocalUpload(existing.imageDesktop);
  deleteLocalUpload(existing.imageMobile);
  await prisma.heroSlide.delete({ where: { id } });
}

export function parseHeroSlideBody(body: Record<string, unknown>) {
  const displayDurationMs = Number(body.displayDurationMs ?? 4000);
  const sortOrder = Number(body.sortOrder ?? 0);
  return {
    eventId: String(body.eventId ?? ""),
    title: String(body.title ?? ""),
    subtitle: String(body.subtitle ?? ""),
    displayDurationMs: Number.isFinite(displayDurationMs) ? displayDurationMs : 4000,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    active: body.active === "false" || body.active === false ? false : true,
    imageDesktopUrl: body.imageDesktopUrl != null ? String(body.imageDesktopUrl) : undefined,
    imageMobileUrl: body.imageMobileUrl != null ? String(body.imageMobileUrl) : undefined,
  };
}
