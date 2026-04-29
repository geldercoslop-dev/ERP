import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { getSessionCookieOptions } from "./cookies.js";
import { sdk } from "./sdk.js";
import type { RequestWithTenant } from "../types/request-with-tenant.js";
import { ValidationError } from './errors/typed-errors.js';
import * as usersService from "../services/users.service.js";

// Type guard real para RequestWithTenant
function isRequestWithTenant(req: Request): req is RequestWithTenant {
  return (
    'user' in req &&
    req.user !== null &&
    typeof req.user === 'object' &&
    'tenantId' in req.user &&
    typeof req.user.tenantId === 'number' &&
    Number.isInteger(req.user.tenantId) &&
    req.user.tenantId > 0
  );
}

export function getTenantFromRequest(req: RequestWithTenant): number {
  // Validar req.user antes de acessar
  if (!req.user || typeof req.user !== 'object') {
    throw new ValidationError("Usuário não autenticado");
  }
  if (!req.user.tenantId || !Number.isFinite(req.user.tenantId) || req.user.tenantId <= 0) {
    throw new ValidationError("tenantId obrigatório no request.");
  }
  return req.user.tenantId;
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      // Type guard real para RequestWithTenant - sem cast estrutural
      if (!isRequestWithTenant(req)) {
        res.status(400).json({ error: "tenantId missing from request" });
        return;
      }
      
      const tenantId = getTenantFromRequest(req);
      
      const userPayload: usersService.InsertUser = {
        tenantId,
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      };

      await usersService.upsertUser(tenantId, userPayload);

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
