import { describe, expect, it, vi, afterEach } from "vitest";
import * as authSecurity from "./_core/auth-security";
import { TRPCError } from "@trpc/server";

describe("Auth Security Layer", () => {
  const username = "testuser";
  const ip = "127.0.0.1";

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should record login failure and eventually block after MAX_ATTEMPTS", async () => {
    const testUser = "bruteforce_user";
    const testIp = "1.1.1.1";

    // Simular 5 falhas
    for (let i = 0; i < 5; i++) {
      await authSecurity.validateLoginAttempt(testUser, testIp);
      authSecurity.recordLoginFailure(testUser, testIp);
    }

    // A 6ª tentativa deve lançar TOO_MANY_REQUESTS
    await expect(authSecurity.validateLoginAttempt(testUser, testIp))
      .rejects.toThrow(TRPCError);
    
    try {
      await authSecurity.validateLoginAttempt(testUser, testIp);
    } catch (error: any) {
      expect(error.code).toBe("TOO_MANY_REQUESTS");
      expect(error.message).toContain("Muitas tentativas de login");
    }
  }, 15_000);

  it("should return a generic error message", () => {
    const error = authSecurity.getGenericAuthError();
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Usuário ou senha inválidos");
  });

  it("should reset attempts after recordLoginSuccess", async () => {
    const testUser = "reset_user";
    const testIp = "2.2.2.2";

    // Falhar 3 vezes
    authSecurity.recordLoginFailure(testUser, testIp);
    authSecurity.recordLoginFailure(testUser, testIp);
    authSecurity.recordLoginFailure(testUser, testIp);

    // Sucesso
    authSecurity.recordLoginSuccess(testUser, testIp);

    // Deve permitir nova tentativa sem erro de bloqueio (e sem delay alto)
    await expect(authSecurity.validateLoginAttempt(testUser, testIp))
      .resolves.not.toThrow();
  });

  it("should allow login again after LOCKOUT_TIME_MS has passed", async () => {
    vi.useFakeTimers();
    const testUser = "lockout_user";
    const testIp = "3.3.3.3";
    const LOCKOUT_TIME_MS = 5 * 60 * 1000;

    // Bloquear
    for (let i = 0; i < 5; i++) {
      authSecurity.recordLoginFailure(testUser, testIp);
    }

    // Confirmar que está bloqueado
    await expect(authSecurity.validateLoginAttempt(testUser, testIp))
      .rejects.toThrow();

    // Avançar o tempo (expira lockout)
    await vi.advanceTimersByTimeAsync(LOCKOUT_TIME_MS + 1000);

    // Após lockout, ainda há delay progressivo (até 10s); drena timers pendentes
    const p = authSecurity.validateLoginAttempt(testUser, testIp);
    await vi.advanceTimersByTimeAsync(15_000);
    await p;
  }, 20_000);
});
