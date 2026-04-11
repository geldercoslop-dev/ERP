import { describe, expect, it } from "vitest";
import { leoSandbox } from "../../leo/security/leo-sandbox.js";

describe("P0.7 Security - LEO RCE", () => {
  it("bloqueia payload { type:'shell', command:'ls' }", async () => {
    const attackPayload = { type: "shell", command: "ls" } as const;

    const result = await leoSandbox.executeAction({
      type: attackPayload.type,
      action: attackPayload.command,
      parameters: { command: attackPayload.command },
      userId: "attacker",
    });

    console.log("[LEO-RCE] payload=", attackPayload, "result=", result);

    expect(result.success).toBe(false);
    expect(String(result.error ?? "")).toContain("Ação bloqueada");
    expect(String(result.error ?? "")).toContain("LEO NUNCA pode executar comandos shell diretamente");
  });

  it("bloqueia tentativa de bypass com powershell", async () => {
    const result = await leoSandbox.checkAction({
      type: "shell",
      action: "powershell -Command Get-ChildItem",
      userId: "attacker",
    });

    console.log("[LEO-RCE-BYPASS] result=", result);

    expect(result.allowed).toBe(false);
    expect(result.riskLevel).toBe("critical");
    expect(result.reason).toContain("LEO NUNCA pode executar comandos shell diretamente");
  });
});