import { describe, expect, it } from "vitest";
import { getUserById, upsertUser } from "../server/services/users.service.js";
import { ADMIN_ACTOR } from "../server/_core/service-actor.js";

describe("Tenant isolation - users service", () => {
  it("tenant A nunca acessa tenant B e vice-versa", async () => {
    const tenantA = 91001;
    const tenantB = 91002;
    const stamp = Date.now();

    const createA = await upsertUser(tenantA, {
      tenantId: tenantA,
      openId: `tenant-a-${stamp}`,
      name: "User Tenant A",
      email: `tenant-a-${stamp}@example.com`,
      role: "user",
    }, ADMIN_ACTOR);

    const createB = await upsertUser(tenantB, {
      tenantId: tenantB,
      openId: `tenant-b-${stamp}`,
      name: "User Tenant B",
      email: `tenant-b-${stamp}@example.com`,
      role: "user",
    }, ADMIN_ACTOR);

    expect(createA.success).toBe(true);
    expect(createB.success).toBe(true);
    expect(createA.data?.id).toBeTypeOf("number");
    expect(createB.data?.id).toBeTypeOf("number");

    const userAId = createA.data!.id;
    const userBId = createB.data!.id;

    const userAFromTenantA = await getUserById(tenantA, userAId);
    const userAFromTenantB = await getUserById(tenantB, userAId);
    const userBFromTenantA = await getUserById(tenantA, userBId);

    expect(userAFromTenantA).not.toBeNull();
    expect(userAFromTenantA?.tenantId).toBe(tenantA);
    expect(userAFromTenantB).toBeNull();
    expect(userBFromTenantA).toBeNull();
  });
});
