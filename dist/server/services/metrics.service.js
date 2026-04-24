import { and, asc, desc, eq, gte, isNotNull, like, lte, or, sql } from "drizzle-orm";
import { auditLogs } from "../../drizzle/schema.js";
import { getDb } from "../db/index.js";
import { ValidationError } from "../_core/errors/typed-errors.js";
import { toDbDateStrict } from "../utils/date.js";
const MAX_RESPONSE_ITEMS = 1000;
function buildBaseConditions(tenantId, range) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError("tenantId is required and must be a positive integer");
    }
    const conditions = [eq(auditLogs.tenantId, tenantId)];
    if (range?.startDate) {
        conditions.push(gte(auditLogs.createdAt, toDbDateStrict(range.startDate)));
    }
    if (range?.endDate) {
        conditions.push(lte(auditLogs.createdAt, toDbDateStrict(range.endDate)));
    }
    return conditions;
}
function toNumber(value) {
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}
function maskIp(ip) {
    if (!ip) {
        return null;
    }
    if (ip.includes(".")) {
        const parts = ip.split(".");
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
        }
    }
    if (ip.includes(":")) {
        const parts = ip.split(":");
        if (parts.length >= 2) {
            return `${parts[0]}:${parts[1]}:xxxx`;
        }
    }
    return "masked";
}
export class MetricsService {
    static async getTotalLogs(tenantId, range) {
        const db = await getDb();
        const conditions = buildBaseConditions(tenantId, range);
        const rows = await db
            .select({ total: sql `COUNT(*)` })
            .from(auditLogs)
            .where(and(...conditions));
        return {
            tenantId,
            totalLogs: toNumber(rows[0]?.total),
        };
    }
    static async getLogsByAction(tenantId, range) {
        const db = await getDb();
        const conditions = buildBaseConditions(tenantId, range);
        const countExpr = sql `COUNT(*)`;
        const rows = await db
            .select({
            action: auditLogs.action,
            total: countExpr,
            lastEventAt: sql `MAX(${auditLogs.createdAt})`,
        })
            .from(auditLogs)
            .where(and(...conditions))
            .groupBy(auditLogs.action)
            .orderBy(desc(sql `MAX(${auditLogs.createdAt})`), desc(countExpr))
            .limit(MAX_RESPONSE_ITEMS);
        return {
            tenantId,
            items: rows.map((row) => ({
                action: row.action,
                total: toNumber(row.total),
            })),
        };
    }
    static async getLogsByEntity(tenantId, range) {
        const db = await getDb();
        const conditions = buildBaseConditions(tenantId, range);
        const countExpr = sql `COUNT(*)`;
        const rows = await db
            .select({
            entity: auditLogs.entity,
            total: countExpr,
            lastEventAt: sql `MAX(${auditLogs.createdAt})`,
        })
            .from(auditLogs)
            .where(and(...conditions))
            .groupBy(auditLogs.entity)
            .orderBy(desc(sql `MAX(${auditLogs.createdAt})`), desc(countExpr))
            .limit(MAX_RESPONSE_ITEMS);
        return {
            tenantId,
            items: rows.map((row) => ({
                entity: row.entity,
                total: toNumber(row.total),
            })),
        };
    }
    static async getErrorRate(tenantId, range) {
        const db = await getDb();
        const baseConditions = buildBaseConditions(tenantId, range);
        const totalRows = await db
            .select({ total: sql `COUNT(*)` })
            .from(auditLogs)
            .where(and(...baseConditions));
        const errorConditions = [
            ...baseConditions,
            or(eq(auditLogs.severity, "ERROR"), like(auditLogs.action, "%ERROR%"), like(auditLogs.action, "%FAIL%")),
        ];
        const errorRows = await db
            .select({ total: sql `COUNT(*)` })
            .from(auditLogs)
            .where(and(...errorConditions));
        const ipCountExpr = sql `COUNT(*)`;
        const topErrorIps = await db
            .select({
            ip: auditLogs.ip,
            total: ipCountExpr,
        })
            .from(auditLogs)
            .where(and(...errorConditions, isNotNull(auditLogs.ip)))
            .groupBy(auditLogs.ip)
            .orderBy(desc(sql `MAX(${auditLogs.createdAt})`), desc(ipCountExpr))
            .limit(Math.min(10, MAX_RESPONSE_ITEMS));
        const totalLogs = toNumber(totalRows[0]?.total);
        const errorLogs = toNumber(errorRows[0]?.total);
        return {
            tenantId,
            totalLogs,
            errorLogs,
            errorRate: totalLogs > 0 ? Number(((errorLogs / totalLogs) * 100).toFixed(2)) : 0,
            topErrorIps: topErrorIps.map((row) => ({
                ip: maskIp(row.ip),
                total: toNumber(row.total),
            })),
        };
    }
    static async getLogsPerDay(tenantId, range) {
        const db = await getDb();
        const conditions = buildBaseConditions(tenantId, range);
        const dateExpr = sql `DATE(${auditLogs.createdAt})`;
        const countExpr = sql `COUNT(*)`;
        const rows = await db
            .select({
            day: dateExpr,
            total: countExpr,
        })
            .from(auditLogs)
            .where(and(...conditions))
            .groupBy(dateExpr)
            .orderBy(asc(dateExpr))
            .limit(MAX_RESPONSE_ITEMS);
        return {
            tenantId,
            items: rows.map((row) => ({
                day: row.day,
                total: toNumber(row.total),
            })),
        };
    }
}
