import 'express';
import type { Permission } from '../security/rbac.js';

declare module 'express-serve-static-core' {
  interface Request {
    traceId?: string;
    userPermissions?: Permission[];
    user?: {
      userId: number;
      tenantId: number;
    };
    requestId?: string;
  }
}
