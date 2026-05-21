import { Router } from "express";
import { z } from "zod";
import * as organizersService from "../services/organizers.service";
import { adminRequired } from "../middleware/auth";

export const organizersAdminRouter = Router();

organizersAdminRouter.use(adminRequired);

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  name: z.string().min(2),
  eventIds: z.array(z.string()).min(1),
});

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(4).optional(),
  name: z.string().min(2).optional(),
  active: z.boolean().optional(),
  eventIds: z.array(z.string()).min(1).optional(),
});

organizersAdminRouter.get("/", async (_req, res, next) => {
  try {
    const organizers = await organizersService.listOrganizers();
    res.json({ organizers });
  } catch (e) {
    next(e);
  }
});

organizersAdminRouter.get("/:id", async (req, res, next) => {
  try {
    const organizer = await organizersService.getOrganizerById(String(req.params.id));
    res.json({ organizer });
  } catch (e) {
    next(e);
  }
});

organizersAdminRouter.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const organizer = await organizersService.createOrganizer(body);
    res.status(201).json({ organizer });
  } catch (e) {
    next(e);
  }
});

organizersAdminRouter.put("/:id", async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const organizer = await organizersService.updateOrganizer(String(req.params.id), body);
    res.json({ organizer });
  } catch (e) {
    next(e);
  }
});

organizersAdminRouter.delete("/:id", async (req, res, next) => {
  try {
    await organizersService.deleteOrganizer(String(req.params.id));
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
