import type { User, Vendedor } from "../../shared/types/entities.js";

// Campos opcionais para compatibilidade com código multi-tenant legado.
export type UserWithTenant = User & { tenantId?: number };
export type VendedorWithTenant = Vendedor & { tenantId?: number };
