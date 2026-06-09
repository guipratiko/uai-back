import { Router } from "express";
import type { Request } from "express";
import { AppError } from "../lib/errors";
import * as heroSlidesService from "../services/hero-slides.service";
import { uploadHeroImages } from "../middleware/upload-hero";
import { adminRequired } from "../middleware/auth";

export const heroSlidesAdminRouter = Router();

heroSlidesAdminRouter.use(adminRequired);

function filesFromRequest(req: Request) {
  const files = req.files as
    | { imageDesktop?: Express.Multer.File[]; imageMobile?: Express.Multer.File[] }
    | undefined;
  return {
    desktopFile: files?.imageDesktop?.[0]?.filename,
    mobileFile: files?.imageMobile?.[0]?.filename,
  };
}

heroSlidesAdminRouter.get("/", async (_req, res, next) => {
  try {
    const slides = await heroSlidesService.listAdminHeroSlides();
    res.json({ slides });
  } catch (e) {
    next(e);
  }
});

heroSlidesAdminRouter.get("/:id", async (req, res, next) => {
  try {
    const slide = await heroSlidesService.getHeroSlideById(String(req.params.id));
    res.json({ slide });
  } catch (e) {
    next(e);
  }
});

heroSlidesAdminRouter.post("/", (req, res, next) => {
  uploadHeroImages(req, res, async (err) => {
    if (err) return next(err instanceof AppError ? err : new AppError(400, String(err)));
    try {
      const parsed = heroSlidesService.parseHeroSlideBody(req.body);
      if (!parsed.eventId) throw new AppError(400, "Selecione um evento");
      if (!parsed.title.trim()) throw new AppError(400, "Título é obrigatório");
      const { desktopFile, mobileFile } = filesFromRequest(req);
      const slide = await heroSlidesService.createHeroSlide({
        ...parsed,
        desktopFile,
        mobileFile,
      });
      res.status(201).json({ slide });
    } catch (e) {
      next(e);
    }
  });
});

heroSlidesAdminRouter.put("/:id", (req, res, next) => {
  uploadHeroImages(req, res, async (err) => {
    if (err) return next(err instanceof AppError ? err : new AppError(400, String(err)));
    try {
      const parsed = heroSlidesService.parseHeroSlideBody(req.body);
      const { desktopFile, mobileFile } = filesFromRequest(req);
      const slide = await heroSlidesService.updateHeroSlide(String(req.params.id), {
        ...parsed,
        desktopFile,
        mobileFile,
      });
      res.json({ slide });
    } catch (e) {
      next(e);
    }
  });
});

heroSlidesAdminRouter.delete("/:id", async (req, res, next) => {
  try {
    await heroSlidesService.deleteHeroSlide(String(req.params.id));
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
