import type { Request } from 'express';

export type RequestWithTenant = Request & {
  user: {
    tenantId: number;
    userId?: number;
  };
  query: unknown;
  params: unknown;
  body: unknown;
};
