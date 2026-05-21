import { Router } from "express";
import { z } from "zod";
import * as eventsService from "../services/events.service";
import { adminRequired } from "../middleware/auth";

export const eventsRouter = Router();

const coordinatesSchema = z.object({ lat: z.number(), lng: z.number() });

const ticketSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string(),
  price: z.number().min(0),
  available: z.number().int().min(0),
  maxPerOrder: z.number().int().min(1),
  benefits: z.array(z.string()).optional(),
});

const eventSchema = z.object({
  slug: z.string().optional(),
  title: z.string().min(1),
  subtitle: z.string(),
  category: z.string(),
  date: z.string(),
  endDate: z.string().optional(),
  time: z.string(),
  venue: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  image: z.string().min(1),
  bannerImage: z.string().min(1),
  description: z.string(),
  highlights: z.array(z.string()),
  organizer: z.string(),
  ageRating: z.string(),
  mapEmbedUrl: z.string(),
  coordinates: coordinatesSchema,
  featured: z.boolean().optional(),
  buyerFeePercent: z.number().min(0).max(100).nullable().optional(),
  platformFeePercent: z.number().min(0).max(100).nullable().optional(),
  allowTransfer: z.boolean().optional(),
  tickets: z.array(ticketSchema).min(1),
});

eventsRouter.get("/", async (_req, res, next) => {
  try {
    const events = await eventsService.listEvents();
    res.json({ events });
  } catch (e) {
    next(e);
  }
});

eventsRouter.get("/:slug", async (req, res, next) => {
  try {
    const event = await eventsService.getEventBySlug(req.params.slug);
    res.json({ event });
  } catch (e) {
    next(e);
  }
});

eventsRouter.post("/", adminRequired, async (req, res, next) => {
  try {
    const body = eventSchema.parse(req.body);
    const event = await eventsService.createEvent(body);
    res.status(201).json({ event });
  } catch (e) {
    next(e);
  }
});

eventsRouter.put("/:id", adminRequired, async (req, res, next) => {
  try {
    const body = eventSchema.partial().parse(req.body);
    const event = await eventsService.updateEvent(String(req.params.id), body);
    res.json({ event });
  } catch (e) {
    next(e);
  }
});

eventsRouter.delete("/:id", adminRequired, async (req, res, next) => {
  try {
    await eventsService.deleteEvent(String(req.params.id));
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
