import { Router } from "express";
import * as heroSlidesService from "../services/hero-slides.service";

export const heroSlidesRouter = Router();

heroSlidesRouter.get("/", async (_req, res, next) => {
  try {
    const slides = await heroSlidesService.listPublicHeroSlides();
    res.json({ slides });
  } catch (e) {
    next(e);
  }
});
