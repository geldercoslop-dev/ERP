import { Router, Request, Response } from "express";
import { MetricsService, type MetricsDateRange } from "../services/metrics.service.js";
import { ValidationError } from '../_core/errors/typed-errors.js';

const router = Router();
type Payload = Record<string, unknown>;
const MAX_RANGE_DAYS = 31;
const MAX_RANGE_MS = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;

function parseIsoDate(value: unknown, label: string): Date {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`${label} is invalid`);
  }

  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+\-]\d{2}:\d{2})$/;

  if (!isoDateOnly.test(value) && !isoDateTime.test(value)) {
    throw new ValidationError(`${label} must be ISO format`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${label} is invalid`);
  }

  return parsed;
}

function parseTenantId(req: Request): number {
  const rawTenantId = req.query.tenantId;
  const tenantId = Number(rawTenantId);

  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError("tenantId is required and must be a positive integer");
  }

  return tenantId;
}

function parseRange(req: Request): MetricsDateRange {
  const range: MetricsDateRange = {};

  if (typeof req.query.startDate === "string" && req.query.startDate.length > 0) {
    range.startDate = parseIsoDate(req.query.startDate, "startDate");
  }

  if (typeof req.query.endDate === "string" && req.query.endDate.length > 0) {
    range.endDate = parseIsoDate(req.query.endDate, "endDate");
  }

  if (range.startDate && range.endDate) {
    const diffMs = range.endDate.getTime() - range.startDate.getTime();
    if (diffMs < 0) {
      throw new ValidationError("endDate must be greater than or equal to startDate");
    }
    if (diffMs > MAX_RANGE_MS) {
      throw new ValidationError(`date range cannot exceed ${MAX_RANGE_DAYS} days`);
    }
  }

  return range;
}

async function handle(
  req: Request,
  res: Response,
  operation: (tenantId: number, range: MetricsDateRange) => Promise<Payload>
): Promise<void> {
  try {
    const tenantId = parseTenantId(req);
    const range = parseRange(req);
    const data = await operation(tenantId, range);

    return void res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message.includes("tenantId") ||
      message.includes("date") ||
      message.includes("Date") ||
      message.includes("startDate") ||
      message.includes("endDate")
        ? 400
        : 500;

    return void res.status(status).json({
      success: false,
      error: message,
    });
  }
}

router.get("/summary", async (req, res) => {
  await handle(req, res, MetricsService.getTotalLogs);
});

router.get("/actions", async (req, res) => {
  await handle(req, res, MetricsService.getLogsByAction);
});

router.get("/entities", async (req, res) => {
  await handle(req, res, MetricsService.getLogsByEntity);
});

router.get("/errors", async (req, res) => {
  await handle(req, res, MetricsService.getErrorRate);
});

router.get("/timeline", async (req, res) => {
  await handle(req, res, MetricsService.getLogsPerDay);
});

export default router;
