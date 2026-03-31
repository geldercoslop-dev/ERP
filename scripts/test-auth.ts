/**
 * Testes de autenticação contra o servidor em execução.
 *
 * Fluxo:
 * 1) POST auth.login (batch)
 * 2) Procedure protegida sem sessão → HTTP 401
 * 3) Mesma procedure com X-Session-Token → HTTP 200
 *
 * Variáveis: BASE_URL (ou TEST_BASE_URL), APP_SECRET, TEST_AUTH_USERNAME, TEST_AUTH_PASSWORD
 *
 * Uso: pnpm exec tsx scripts/test-auth.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const BASE_URL = (process.env.BASE_URL ?? process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);
const APP_SECRET = process.env.APP_SECRET?.trim();
const USERNAME = process.env.TEST_AUTH_USERNAME ?? "admin";
const PASSWORD = process.env.TEST_AUTH_PASSWORD ?? "admin123";

const UA = "scripts/test-auth/1.0";

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function parseBatchJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractLoginOk(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  const result = r.result as Record<string, unknown> | undefined;
  const inner = result?.data as Record<string, unknown> | undefined;
  const json = inner?.json as Record<string, unknown> | undefined;
  return json?.ok === true;
}

function extractSessionToken(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;
  const result = r.result as Record<string, unknown> | undefined;
  const inner = result?.data as Record<string, unknown> | undefined;
  const json = inner?.json as Record<string, unknown> | undefined;
  const tok = json?.sessionToken;
  return typeof tok === "string" ? tok : undefined;
}

async function main(): Promise<void> {
  if (!APP_SECRET) {
    fail("APP_SECRET não definido no ambiente (.env)");
  }

  const loginUrl = `${BASE_URL}/api/trpc/auth.login?batch=1`;
  const loginRes = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ 0: { json: { username: USERNAME, password: PASSWORD } } }),
  });

  const loginText = await loginRes.text();
  const loginJson = parseBatchJson(loginText);
  if (!loginJson) {
    fail(`Login: resposta não é JSON: ${loginText.slice(0, 300)}`);
  }

  if (!loginRes.ok || !extractLoginOk(loginJson)) {
    console.error(loginText);
    fail(`Login esperado HTTP 200 e ok:true; obtido status=${loginRes.status}`);
  }
  console.log("✔ login OK");

  const sessionToken = extractSessionToken(loginJson);
  if (!sessionToken) {
    fail("Login não retornou sessionToken no JSON (batch)");
  }

  const protectedUrl = `${BASE_URL}/api/trpc/config.get?batch=1`;
  const protectedBody = JSON.stringify({
    0: { json: { chave: "__test_auth_probe__" } },
  });

  const noSessionRes = await fetch(protectedUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      "X-App-Secret": APP_SECRET,
    },
    body: protectedBody,
  });

  if (noSessionRes.status !== 401) {
    const t = await noSessionRes.text();
    fail(`Sem token de sessão: esperado HTTP 401, obtido ${noSessionRes.status}: ${t.slice(0, 400)}`);
  }
  console.log("✔ request sem token de sessão → 401");

  const withSessionRes = await fetch(protectedUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      "X-App-Secret": APP_SECRET,
      "X-Session-Token": sessionToken,
    },
    body: protectedBody,
  });

  if (withSessionRes.status !== 200) {
    const t = await withSessionRes.text();
    fail(`Com token: esperado HTTP 200, obtido ${withSessionRes.status}: ${t.slice(0, 400)}`);
  }
  console.log("✔ request com token → 200");

  console.log("\n✅ test-auth concluído com sucesso.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
