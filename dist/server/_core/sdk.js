import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import { ForbiddenError } from "../../shared/errors/typed-errors.js";
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env.js";
import * as db from "../db/index.js";
import { ValidationError } from "./errors/typed-errors.js";
import { toDbDate } from "../utils/date.js";
// Utility function
const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
// Type guard for platform data
function isPlatformData(data) {
    if (typeof data !== 'object' || data === null)
        return false;
    const obj = data;
    const hasValidPlatforms = !('platforms' in obj) || Array.isArray(obj.platforms);
    const hasValidPlatform = !('platform' in obj) || typeof obj.platform === 'string';
    return hasValidPlatforms && hasValidPlatform;
}
const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
class OAuthService {
    client;
    constructor(client) {
        this.client = client;
        // OAuth DESABILITADO - Usando apenas login local
        console.log("[OAuth] DISABLED - Using local login only");
        // if (!ENV.oAuthServerUrl) {
        //   console.error(
        //     "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
        //   );
        //   throw new ValidationError("OAUTH_SERVER_URL is not configured");
        // }
    }
    decodeState(state) {
        const redirectUri = atob(state);
        return redirectUri;
    }
    async getTokenByCode(code, state) {
        const payload = {
            clientId: ENV.appId,
            grantType: "authorization_code",
            code,
            redirectUri: this.decodeState(state),
        };
        const { data } = await this.client.post(EXCHANGE_TOKEN_PATH, payload);
        return data;
    }
    async getUserInfoByToken(token) {
        const { data } = await this.client.post(GET_USER_INFO_PATH, {
            accessToken: token.accessToken,
        });
        return data;
    }
}
const createOAuthHttpClient = () => axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
});
class SDKServer {
    client;
    oauthService;
    constructor(client = createOAuthHttpClient()) {
        this.client = client;
        this.oauthService = new OAuthService(this.client);
    }
    deriveLoginMethod(platforms, fallback) {
        if (fallback && fallback.length > 0)
            return fallback;
        if (!Array.isArray(platforms) || platforms.length === 0)
            return null;
        const set = new Set(platforms.filter((p) => typeof p === "string"));
        if (set.has("REGISTERED_PLATFORM_EMAIL"))
            return "email";
        if (set.has("REGISTERED_PLATFORM_GOOGLE"))
            return "google";
        if (set.has("REGISTERED_PLATFORM_APPLE"))
            return "apple";
        if (set.has("REGISTERED_PLATFORM_MICROSOFT") ||
            set.has("REGISTERED_PLATFORM_AZURE"))
            return "microsoft";
        if (set.has("REGISTERED_PLATFORM_GITHUB"))
            return "github";
        const first = set.values().next().value || null;
        return first ? first.toLowerCase() : null;
    }
    /**
     * Exchange OAuth authorization code for access token
     * @example
     * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
     */
    async exchangeCodeForToken(code, state) {
        return this.oauthService.getTokenByCode(code, state);
    }
    /**
     * Get user information using access token
     * @example
     * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
     */
    async getUserInfo(accessToken) {
        const data = await this.oauthService.getUserInfoByToken({
            accessToken,
        });
        const loginMethod = this.deriveLoginMethod(isPlatformData(data) ? data.platforms : undefined, isPlatformData(data) ? data.platform : null);
        return {
            ...(isPlatformData(data) ? data : {}),
            platform: loginMethod,
            loginMethod,
        };
    }
    parseCookies(cookieHeader) {
        if (!cookieHeader) {
            return new Map();
        }
        const parsed = parseCookieHeader(cookieHeader);
        return new Map(Object.entries(parsed));
    }
    getSessionSecret() {
        const secret = ENV.cookieSecret;
        return new TextEncoder().encode(secret);
    }
    /**
     * Create a session token for a Manus user openId
     * @example
     * const sessionToken = await sdk.createSessionToken(userInfo.openId);
     */
    async createSessionToken(openId, options = {}) {
        return this.signSession({
            openId,
            appId: ENV.appId,
            name: options.name || "",
        }, options);
    }
    async signSession(payload, options = {}) {
        const issuedAt = Date.now();
        const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
        const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
        const secretKey = this.getSessionSecret();
        return new SignJWT({
            openId: payload.openId,
            appId: payload.appId,
            name: payload.name,
        })
            .setProtectedHeader({ alg: "HS256", typ: "JWT" })
            .setExpirationTime(expirationSeconds)
            .sign(secretKey);
    }
    async verifySession(cookieValue) {
        if (!cookieValue) {
            console.warn("[Auth] Missing session cookie");
            return null;
        }
        try {
            const secretKey = this.getSessionSecret();
            const { payload } = await jwtVerify(cookieValue, secretKey, {
                algorithms: ["HS256"],
            });
            const { openId, appId, name } = payload;
            if (!isNonEmptyString(openId) ||
                !isNonEmptyString(appId) ||
                !isNonEmptyString(name)) {
                console.warn("[Auth] Session payload missing required fields");
                return null;
            }
            return {
                openId,
                appId,
                name,
            };
        }
        catch (error) {
            console.warn("[Auth] Session verification failed", String(error));
            return null;
        }
    }
    async getUserInfoWithJwt(jwtToken) {
        const payload = {
            jwtToken,
            projectId: ENV.appId,
        };
        const { data } = await this.client.post(GET_USER_INFO_WITH_JWT_PATH, payload);
        const loginMethod = this.deriveLoginMethod(isPlatformData(data) ? data.platforms : undefined, isPlatformData(data) ? data.platform : null);
        return {
            ...(isPlatformData(data) ? data : {}),
            platform: loginMethod,
            loginMethod,
        };
    }
    async authenticateRequest(req) {
        // Regular authentication flow
        const cookies = this.parseCookies(req.headers.cookie);
        const sessionCookie = cookies.get(COOKIE_NAME);
        const session = await this.verifySession(sessionCookie);
        if (!session) {
            throw ForbiddenError("Invalid session cookie");
        }
        const sessionUserId = session.openId;
        const signedInAt = new Date();
        let user = await db.getUserByOpenId(sessionUserId);
        // If user not in DB, sync from OAuth server automatically
        if (!user) {
            try {
                const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
                const tenantId = req.user.tenantId;
                if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
                    throw new ValidationError("tenantId obrigatório");
                }
                await db.upsertUser(tenantId, {
                    tenantId,
                    openId: userInfo.openId,
                    name: userInfo.name || null,
                    email: userInfo.email ?? null,
                    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
                    lastSignedIn: toDbDate(signedInAt),
                });
                user = await db.getUserByOpenId(userInfo.openId);
            }
            catch (error) {
                console.error("[Auth] Failed to sync user from OAuth:", error);
                throw ForbiddenError("Failed to sync user info");
            }
        }
        if (!user) {
            throw ForbiddenError("User not found");
        }
        const tenantId = user.tenantId;
        if (!tenantId || !Number.isFinite(tenantId) || tenantId <= 0) {
            throw new ValidationError("User sem tenantId válido.");
        }
        await db.upsertUser(tenantId, {
            tenantId,
            openId: user.openId,
            lastSignedIn: toDbDate(signedInAt),
        });
        return user;
    }
}
export const sdk = new SDKServer();
