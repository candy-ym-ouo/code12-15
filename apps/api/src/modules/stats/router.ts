import { Router } from "express";
import { asyncHandler, sendData } from "../../lib/http";
import { currentUser, requireAuth } from "../../middleware/auth";
import { validate, validatedQuery } from "../../middleware/validate";
import {
  calendarQuerySchema,
  compareQuerySchema,
  overviewQuerySchema,
  phenologyQuerySchema,
  weatherQuerySchema,
  type CalendarQuery,
  type CompareQuery,
  type OverviewQuery,
  type PhenologyQuery,
  type WeatherQuery,
} from "./schema";
import * as service from "./service";
import * as calendarService from "./calendar-service";

export const statsRouter = Router();

statsRouter.use(requireAuth);

statsRouter.get(
  "/calendar",
  validate({ query: calendarQuerySchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await calendarService.calendar(currentUser(req).id, validatedQuery<CalendarQuery>(req)));
  }),
);

statsRouter.get(
  "/compare",
  validate({ query: compareQuerySchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.compare(currentUser(req).id, validatedQuery<CompareQuery>(req)));
  }),
);

statsRouter.get(
  "/phenology",
  validate({ query: phenologyQuerySchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.phenology(currentUser(req).id, validatedQuery<PhenologyQuery>(req)));
  }),
);

statsRouter.get(
  "/weather",
  validate({ query: weatherQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await service.weather(currentUser(req).id, validatedQuery<WeatherQuery>(req));
    sendData(res, result);
  }),
);

statsRouter.get(
  "/overview",
  validate({ query: overviewQuerySchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.overview(currentUser(req).id, validatedQuery<OverviewQuery>(req)));
  }),
);
