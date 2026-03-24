#!/usr/bin/env node
/**
 * Teste HTTP real (produção-like) — autocannon + validações manuais.
 *
 * Variáveis:
 *   HTTP_PERF_BASE_URL     (default: http://localhost:3001)
 *   HTTP_PERF_USERNAME     (obrigatório exceto se só HEALTH)
 *   HTTP_PERF_PASSWORD
 *   HTTP_PERF_DURATION     segundos por cenário autocannon (default 10)
 *   HTTP_PERF_AUTH_RPS     (default 20)
 *   HTTP_PERF_PEDIDOS_CONN conexões simultâneas createVenda (default 35)
 *   HTTP_PERF_CLIENTE_ID   opcional — recomendado para carga estável
 *   HTTP_PERF_VENDEDOR_ID  obrigatório se login for admin (createVenda exige vendedor para role admin)
 *   HTTP_PERF_PRODUTO_ID     default 1
 *   HTTP_PERF_ADMIN_USER / HTTP_PERF_ADMIN_PASSWORD — para boletos.baixarParcial
 *   HTTP_PERF_BOLETO_ID / HTTP_PERF_VALOR_PAGO — baixa parcial (1 chamada + opcional carga leve)
 *   HTTP_PERF_ONLY         health | auth | pedidos | finance | leo | concurrency | all
 */

import autocannon from "autocannon";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { batchBody0, parseTrpcBatchJson, trpcBatchUrl } from "./lib/trpc-http.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = process.env.HTTP_PERF_BASE_URL || `http://localhost:${process.env.PORT || "3001"}`;
const USER = process.env.HTTP_PERF_USERNAME || "";
const PASS = process.env.HTTP_PERF_PASSWORD || "";
const DURATION = Math.max(3, Number(process.env.HTTP_PERF_DURATION || 10));
const AUTH_RPS = Math.max(1, Number(process.env.HTTP_PERF_AUTH_RPS || 20));
const PEDIDOS_CONN = Math.max(1, Math.min(200, Number(process.env.HTTP_PERF_PEDIDOS_CONN || 35)));
const CLIENTE_ID = process.env.HTTP_PERF_CLIENTE_ID ? Number(process.env.HTTP_PERF_CLIENTE_ID) : undefined;
const VENDEDOR_ID = process.env.HTTP_PERF_VENDEDOR_ID ? Number(process.env.HTTP_PERF_VENDEDOR_ID) : undefined;
const PRODUTO_ID = Number(process.env.HTTP_PERF_PRODUTO_ID || 1);
const ONLY = (process.env.HTTP_PERF_ONLY || "all").toLowerCase();

const ADMIN_USER = process.env.HTTP_PERF_ADMIN_USER || "";
const ADMIN_PASS = process.env.HTTP_PERF_ADMIN_PASSWORD || "";
const BOLETO_ID = process.env.HTTP_PERF_BOLETO_ID ? Number(process.env.HTTP_PERF_BOLETO_ID) : undefined;
const VALOR_PAGO = process.env.HTTP_PERF_VALOR_PAGO != null ? Number(process.env.HTTP_PERF_VALOR_PAGO) : undefined;
const CONCURRENCY_FETCH_MS = Math.max(30_000, Number(process.env.HTTP_PERF_CONCURRENCY_TIMEOUT_MS || 120_000));

const report = {
  baseUrl: BASE,
  timestamp: new Date().toISOString(),
  passed: [],
  failed: [],
  warnings: [],
  autocannon: {},
  concurrency: {},
  finance: {},
};

/** Headers para POST /api/* com CSRF (double-submit: cookie + x-csrf-token). */
let defaultPostHeaders = { "content-type": "application/json" };

async function ensureCsrf() {
  try {
    const url = new URL("/api/csrf-token", BASE).toString();
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const j = await r.json();
    const token = j?.csrfToken;
    if (!token) {
      report.warnings.push("CSRF: GET /api/csrf-token sem csrfToken — POSTs podem receber 403.");
      return;
    }
    defaultPostHeaders = {
      "content-type": "application/json",
      cookie: `csrf-token=${token}`,
      "x-csrf-token": token,
    };
  } catch (e) {
    report.warnings.push(`CSRF: falha ao obter token (${String(e?.message || e)})`);
  }
}

/** Mescla headers de POST com CSRF e extras (ex.: x-session-token). Alinha ao SPA: Bearer + X-Session-Token. */
function postHeaders(extra = {}) {
  const merged = { ...defaultPostHeaders, ...extra };
  const st = merged["x-session-token"] ?? merged["X-Session-Token"];
  if (typeof st === "string" && st.trim() && !merged.Authorization) {
    merged.Authorization = `Bearer ${st.trim()}`;
  }
  return merged;
}

function shouldRun(name) {
  if (ONLY === "all") return true;
  return ONLY === name;
}

async function fetchText(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (opts.timeoutMs ?? 30_000));
  try {
    const r = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { Accept: "application/json", ...(opts.headers || {}) },
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text, headers: r.headers };
  } finally {
    clearTimeout(t);
  }
}

/** autocannon usa `{ 503: { count: n } }` — não comparar com `> 0` no objeto inteiro. */
function statusCount(res, code) {
  const slot = res?.statusCodeStats?.[String(code)];
  if (slot == null) return 0;
  if (typeof slot === "number") return slot;
  return Number(slot.count ?? 0);
}

function summarizeAutocannon(title, res) {
  const timeouts = res?.timeouts ?? 0;
  const lat = res?.latency;
  const codes = res?.statusCodeStats || {};
  return {
    title,
    requests: res?.requests?.total,
    throughput: res?.throughput?.average,
    latency: lat
      ? { mean: lat.mean, p50: lat.p50, p99: lat.p99, max: lat.max }
      : undefined,
    timeouts,
    statusCodeStats: codes,
  };
}

async function runHealth() {
  const url = new URL("/api/system/health", BASE).toString();
  const res = await autocannon({
    title: "D_HEALTH",
    url: BASE,
    path: "/api/system/health",
    method: "GET",
    connections: 20,
    duration: DURATION,
    timeout: 30,
  });
  report.autocannon.health = summarizeAutocannon("GET /api/system/health", res);

  const has500 = statusCount(res, 500) > 0;
  const has503 = statusCount(res, 503) > 0;
  if (res?.timeouts > 0) report.failed.push("HEALTH: timeouts");
  if (has500) report.failed.push("HEALTH: HTTP 500");
  if (has503) report.warnings.push("HEALTH: HTTP 503 (degradado)");
  if (!has500 && res?.timeouts === 0) report.passed.push("HEALTH: sem 500/timeout (autocannon)");
}

async function runAuthLoad() {
  if (!USER || !PASS) {
    report.warnings.push("AUTH load: HTTP_PERF_USERNAME/PASSWORD não definidos — pulando.");
    return;
  }
  const body = batchBody0({ username: USER, password: PASS });
  const res = await autocannon({
    title: "A_AUTH",
    url: BASE,
    path: "/api/trpc/auth.login?batch=1",
    method: "POST",
    headers: postHeaders(),
    body,
    connections: Math.min(40, AUTH_RPS * 2),
    duration: DURATION,
    overallRate: AUTH_RPS,
    timeout: 30,
  });
  report.autocannon.auth = summarizeAutocannon(`auth.login @ ${AUTH_RPS} req/s`, res);

  if (res?.timeouts > 0) report.failed.push("AUTH: timeouts");
  if (statusCount(res, 500) > 0) report.failed.push("AUTH: HTTP 500");
  if (statusCount(res, 403) > 0) report.failed.push("AUTH: HTTP 403 (CSRF ou bloqueio)");
  if (res?.timeouts === 0 && statusCount(res, 403) === 0) {
    report.passed.push(`AUTH: carga ${AUTH_RPS} req/s executada`);
  }
}

function buildCreateVendaBody() {
  const idem = "[<id>]";
  const observacoes = `http-perf ${idem}`;
  /** @type {Record<string, unknown>} */
  const base = {
    idempotencyKey: idem,
    cliente: {
      nome: `Cliente Perf ${idem}`,
      telefone: "11988887777",
      rua: "Rua Teste",
      numero: "1",
      bairro: "Centro",
      cidade: "São Paulo",
      uf: "SP",
    },
    subtotal: 110,
    desconto: 0,
    frete: 0,
    total: 110,
    pagamentos: [{ tipo: "DINHEIRO", valor: 110 }],
    observacoes,
    itens: [
      {
        tipo: "LIVRE",
        descricao: `Item perf ${idem}`,
        quantidade: 1,
        valorUnitario: 110,
        custo: 0,
        prazoGarantia: 0,
      },
    ],
  };
  if (CLIENTE_ID != null && !Number.isNaN(CLIENTE_ID)) {
    base.clienteId = CLIENTE_ID;
  }
  if (VENDEDOR_ID != null && !Number.isNaN(VENDEDOR_ID)) {
    base.vendedorId = VENDEDOR_ID;
  }
  return batchBody0(base);
}

async function runPedidosLoad(sessionToken) {
  const body = buildCreateVendaBody();
  let res;
  try {
    res = await autocannon({
      title: "B_PEDIDOS",
      url: BASE,
      path: "/api/trpc/pedidos.createVenda?batch=1",
      method: "POST",
      headers: postHeaders({ "x-session-token": sessionToken }),
      body,
      connections: PEDIDOS_CONN,
      duration: DURATION,
      // idReplacement com body JSON batch pode impedir envio em alguns ambientes — desligado
      idReplacement: false,
      timeout: 120,
    });
  } catch (e) {
    report.failed.push(`PEDIDOS: autocannon exceção — ${String(e?.message || e)}`);
    report.autocannon.pedidos = { error: String(e?.message || e) };
    return;
  }
  report.autocannon.pedidos = summarizeAutocannon(`pedidos.createVenda (${PEDIDOS_CONN} conn)`, res);

  if (res?.timeouts > 0) report.failed.push("PEDIDOS: timeouts");
  if (statusCount(res, 500) > 0) report.failed.push("PEDIDOS: HTTP 500");
  if (statusCount(res, 503) > 0) {
    report.failed.push("PEDIDOS: HTTP 503 (DB/circuit breaker ou sobrecarga)");
  }
  const reqTotal = res?.requests?.total ?? res?.requests ?? 0;
  if (reqTotal === 0) {
    report.failed.push("PEDIDOS: autocannon não registrou requisições (ver CSRF/URL/servidor)");
  } else if (
    res?.timeouts === 0 &&
    statusCount(res, 500) === 0 &&
    statusCount(res, 503) === 0
  ) {
    report.passed.push(`PEDIDOS: POST concorrente (${PEDIDOS_CONN} conexões) sem 5xx/timeout`);
  }
}

async function loginSession(user, pass) {
  const url = trpcBatchUrl(BASE, "auth.login");
  const r = await fetchText(url, {
    method: "POST",
    headers: postHeaders(),
    body: batchBody0({ username: user, password: pass }),
    timeoutMs: 30_000,
  });
  if (!r.ok) {
    return { error: `login HTTP ${r.status}`, text: r.text };
  }
  const data = parseTrpcBatchJson(r.text);
  const token = data?.sessionToken;
  if (!token) {
    return { error: "login sem sessionToken", text: r.text.slice(0, 500) };
  }
  return { sessionToken: token };
}

async function runConcurrencyIdempotency(sessionToken) {
  if (CLIENTE_ID == null || Number.isNaN(CLIENTE_ID)) {
    report.warnings.push(
      "CONCORRÊNCIA: defina HTTP_PERF_CLIENTE_ID para testar 50× mesma idempotencyKey sem corrida em criação de cliente."
    );
    report.concurrency = { skipped: true, reason: "HTTP_PERF_CLIENTE_ID obrigatório para este cenário" };
    return;
  }

  const fixedKey = `http-perf-dup-${Date.now()}`;
  const url = trpcBatchUrl(BASE, "pedidos.createVenda");
  const payload = JSON.parse(buildCreateVendaBody());
  const inner = payload["0"];
  inner.idempotencyKey = fixedKey;
  if (CLIENTE_ID != null) inner.clienteId = CLIENTE_ID;
  const body = JSON.stringify(payload);

  const n = 50;
  const tasks = Array.from({ length: n }, () =>
    fetchText(url, {
      method: "POST",
      headers: postHeaders({ "x-session-token": sessionToken }),
      body,
      timeoutMs: CONCURRENCY_FETCH_MS,
    })
  );

  const results = await Promise.all(tasks);
  const pedidoIds = new Set();
  let errors = 0;
  let duplicates = 0;
  let inProgressCount = 0;
  let firstId = null;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.ok) {
      errors++;
      if (errors === 1 && process.env.HTTP_PERF_DEBUG === "1") {
        console.error(`[http-perf] primeira falha concorrência HTTP ${r.status}:`, r.text?.slice(0, 400));
      }
      continue;
    }
    const data = parseTrpcBatchJson(r.text);
    if (data?.inProgress === true) {
      inProgressCount++;
      continue;
    }
    if (data?.pedidoId != null) {
      if (firstId == null) firstId = data.pedidoId;
      pedidoIds.add(data.pedidoId);
      if (data.isDuplicate === true) duplicates++;
    }
  }

  report.concurrency = {
    sameIdempotencyKey: fixedKey,
    parallelRequests: n,
    uniquePedidoIds: pedidoIds.size,
    duplicateFlags: duplicates,
    inProgressResponses: inProgressCount,
    httpErrors: errors,
    sampleFirstPedidoId: firstId,
  };

  if (errors === 0 && pedidoIds.size <= 1) {
    report.passed.push(
      "CONCORRÊNCIA: todas as respostas HTTP OK; no máximo 1 pedidoId distinto (demais inProgress/idempotência)"
    );
  } else if (pedidoIds.size > 1) {
    report.failed.push(`CONCORRÊNCIA: esperado 1 pedidoId, obtidos ${pedidoIds.size} distintos`);
  }
  if (errors > 0) {
    report.failed.push(`CONCORRÊNCIA: ${errors} falhas HTTP (503/timeout/etc.)`);
  }
}

/** LEO: procedure pública leo.status (sem auth) — smoke de carga. */
async function runLeoStatusLoad() {
  const body = JSON.stringify({ 0: null });
  const res = await autocannon({
    title: "D_LEO",
    url: BASE,
    path: "/api/trpc/leo.status?batch=1",
    method: "POST",
    headers: postHeaders(),
    body,
    connections: 8,
    duration: Math.min(DURATION, 15),
    timeout: 30,
  });
  report.autocannon.leo = summarizeAutocannon("POST leo.status (público)", res);

  if (res?.timeouts > 0) report.failed.push("LEO: timeouts");
  if (res?.statusCodeStats?.["500"] > 0) report.failed.push("LEO: HTTP 500");
  else report.passed.push("LEO: leo.status sem 500/timeout (autocannon)");
}

async function runFinanceAdmin() {
  if (!ADMIN_USER || !ADMIN_PASS) {
    report.warnings.push("FINANCEIRO: defina HTTP_PERF_ADMIN_USER/PASSWORD e BOLETO_ID/VALOR_PAGO para testar baixa.");
    return;
  }
  if (BOLETO_ID == null || Number.isNaN(BOLETO_ID) || VALOR_PAGO == null) {
    report.warnings.push("FINANCEIRO: HTTP_PERF_BOLETO_ID ou VALOR_PAGO ausente — pulando baixa.");
    return;
  }

  const login = await loginSession(ADMIN_USER, ADMIN_PASS);
  if (login.error) {
    report.failed.push(`FINANCEIRO: login admin ${login.error}`);
    return;
  }

  const token = login.sessionToken;
  const body = batchBody0({ boletoId: BOLETO_ID, valorPago: VALOR_PAGO });
  const res = await autocannon({
    title: "C_FINANCE",
    url: BASE,
    path: "/api/trpc/boletos.baixarParcial?batch=1",
    method: "POST",
    headers: postHeaders({ "x-session-token": token }),
    body,
    connections: 5,
    duration: Math.min(DURATION, 15),
    amount: 20,
    timeout: 60,
  });
  report.autocannon.finance = summarizeAutocannon("boletos.baixarParcial (carga leve)", res);

  if (statusCount(res, 500) > 0) report.failed.push("FINANCEIRO: HTTP 500 na baixa");
  else report.passed.push("FINANCEIRO: baixa boleto (admin) executada sem 500 (ver non2xx por saldo)");

  report.finance.note =
    "baixarParcial não usa idempotency no router — não dispare alta concorrência contra o mesmo boleto (risco de duplicar crédito). Este script usa carga leve (amount=20).";
}

function renderMarkdown() {
  const lines = [
    `# Relatório HTTP real (performance)`,
    ``,
    `- **Base:** ${report.baseUrl}`,
    `- **Quando:** ${report.timestamp}`,
    ``,
    `## ✔ Passou`,
    ...(report.passed.length ? report.passed.map((x) => `- ${x}`) : ["- (nenhum)"]),
    ``,
    `## ❌ Falhou`,
    ...(report.failed.length ? report.failed.map((x) => `- ${x}`) : ["- (nenhum)"]),
    ``,
    `## ⚠ Gargalos / avisos`,
    ...(report.warnings.length ? report.warnings.map((x) => `- ${x}`) : ["- (nenhum)"]),
    ``,
    `## Concorrência (idempotência pedido)`,
    "```json",
    JSON.stringify(report.concurrency, null, 2),
    "```",
    ``,
    `## Financeiro`,
    report.finance.note || "-",
    ``,
    `## Autocannon (resumo)`,
    "```json",
    JSON.stringify(report.autocannon, null, 2),
    "```",
    ``,
    `### Critérios`,
    `- Sem erro 500 nos cenários exercitados`,
    `- Sem timeout (ajustar HTTP_PERF_DURATION / conexões)`,
    `- Latência: ver média/p99 no JSON`,
    `- Auth: header **X-Session-Token** após login (igual ao client SPA)`,
    ``,
  ];
  return lines.join("\n");
}

async function main() {
  const needsCsrf =
    ONLY === "all" ||
    ["auth", "pedidos", "concurrency", "finance", "leo"].includes(ONLY);
  if (needsCsrf) await ensureCsrf();

  if (shouldRun("health")) await runHealth();

  if (shouldRun("leo")) await runLeoStatusLoad();

  /**
   * Obter sessão ANTES da carga em auth.login — senão o rate limit por IP
   * (e/ou tentativas no router) faz o login único falhar após o autocannon.
   */
  let session = null;
  if ((shouldRun("pedidos") || shouldRun("concurrency") || ONLY === "all") && USER && PASS) {
    session = await loginSession(USER, PASS);
    if (session.error) {
      report.failed.push(`LOGIN: ${session.error}`);
      report.warnings.push("Defina HTTP_PERF_USERNAME / HTTP_PERF_PASSWORD válidos para cenários autenticados.");
    }
  }

  if (shouldRun("pedidos") && session?.sessionToken) {
    await runPedidosLoad(session.sessionToken);
  } else if (shouldRun("pedidos") && !session?.sessionToken) {
    report.warnings.push("PEDIDOS: sessão ausente — pulando POST createVenda.");
  }

  if (shouldRun("concurrency") && session?.sessionToken) {
    await runConcurrencyIdempotency(session.sessionToken);
  }

  if (shouldRun("finance")) {
    await runFinanceAdmin();
  }

  if (shouldRun("auth")) {
    await runAuthLoad();
  }

  const md = renderMarkdown();
  const out = join(__dirname, "..", "..", "docs", "reports", "HTTP_PERF_REAL_REPORT.md");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md, "utf8");
  console.log(md);
  console.log(`\n[http-perf] Relatório salvo em: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
