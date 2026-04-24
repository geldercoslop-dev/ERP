import * as db from "../db/index.js";
function buildUserFromVendedor(vendedor, tenantId) {
    return {
        id: vendedor.id,
        tenantId,
        openId: `vendedor-${vendedor.id}`,
        name: vendedor.nome ?? "Vendedor",
        email: vendedor.email ?? null,
        role: ((typeof vendedor.admin === "number" ? vendedor.admin > 0 : vendedor.admin) ? "admin" : "user"),
        loginMethod: "local",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSignedIn: new Date().toISOString(),
    };
}
export async function resolveSessionPrincipal(token, adminSessionToken) {
    let user = null;
    let vendedor = null;
    let tenantId = null;
    let isImpersonating = false;
    let tokenKind = "unknown";
    let shouldClearSession = false;
    if (typeof token === "string" && token.startsWith("u:")) {
        tokenKind = "user";
        const userId = parseInt(token.slice(2), 10);
        if (Number.isFinite(userId)) {
            const loadedUser = await db.getUserById(userId);
            if (loadedUser) {
                user = loadedUser;
                tenantId = loadedUser.tenantId ?? null;
            }
        }
    }
    else if (typeof token === "string" && token.startsWith("v:")) {
        tokenKind = "vendedor";
        const parts = token.split(":");
        const tokenTenantId = Number(parts[1]);
        const vendedorId = Number(parts[2]);
        if (Number.isInteger(tokenTenantId) && tokenTenantId > 0 && Number.isInteger(vendedorId) && vendedorId > 0) {
            const loadedVendedor = await db.getVendedorById(vendedorId);
            if (loadedVendedor?.ativo) {
                vendedor = loadedVendedor;
                tenantId = tokenTenantId;
                user = buildUserFromVendedor(loadedVendedor, tokenTenantId);
                isImpersonating = Boolean(typeof adminSessionToken === "string" && adminSessionToken.length > 0);
            }
            else {
                shouldClearSession = true;
            }
        }
    }
    else if (token === "admin-session") {
        tokenKind = "admin-session";
        const loadedUser = await db.getUserByOpenId("admin");
        if (loadedUser) {
            user = loadedUser;
            tenantId = loadedUser.tenantId ?? null;
        }
    }
    else if (token === "vendedor-session") {
        tokenKind = "vendedor-session";
    }
    return {
        user,
        vendedor,
        tenantId,
        isImpersonating,
        tokenKind,
        shouldClearSession,
    };
}
