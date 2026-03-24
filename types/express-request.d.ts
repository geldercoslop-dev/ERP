import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    user?: { id: number; role?: string; email?: string; [key: string]: unknown };
    requestId?: string;
    tenantId?: number;
    startTime?: number;
    abortSignal?: AbortSignal;
  }
}

export {};
