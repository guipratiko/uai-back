import { Router } from "express";
import { z } from "zod";
import * as producersService from "../services/producers.service";
import { adminRequired } from "../middleware/auth";

export const producersAdminRouter = Router();

producersAdminRouter.use(adminRequired);

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

producersAdminRouter.get("/", async (_req, res, next) => {
  try {
    const producers = await producersService.listProducers();
    res.json({ producers });
  } catch (e) {
    next(e);
  }
});

producersAdminRouter.get("/:id", async (req, res, next) => {
  try {
    const producer = await producersService.getProducerById(String(req.params.id));
    res.json({ producer });
  } catch (e) {
    next(e);
  }
});

producersAdminRouter.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const producer = await producersService.createProducer(body);
    res.status(201).json({ producer });
  } catch (e) {
    next(e);
  }
});

producersAdminRouter.put("/:id", async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const producer = await producersService.updateProducer(String(req.params.id), body);
    res.json({ producer });
  } catch (e) {
    next(e);
  }
});

producersAdminRouter.delete("/:id", async (req, res, next) => {
  try {
    await producersService.deleteProducer(String(req.params.id));
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
