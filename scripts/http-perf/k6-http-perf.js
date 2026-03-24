/**
 * k6 (opcional) — instale k6: https://k6.io/docs/get-started/installation/
 *
 * Uso:
 *   set K6_HTTP_PERF_BASE_URL=http://localhost:3001
 *   set K6_HTTP_PERF_USER=...
 *   set K6_HTTP_PERF_PASS=...
 *   k6 run scripts/http-perf/k6-http-perf.js
 *
 * Cenários: health (GET), auth.login (batch), pedidos.createVenda (VU único com token em SharedArray).
 * Para token: 1 VU faz login e grava em __ENV injetado via handleSummary não é trivial;
 * este script usa opção simplificada — passe K6_SESSION_TOKEN após login manual ou use só health+auth.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const base = __ENV.K6_HTTP_PERF_BASE_URL || "http://localhost:3001";
const user = __ENV.K6_HTTP_PERF_USER || "";
const pass = __ENV.K6_HTTP_PERF_PASS || "";
const token = __ENV.K6_SESSION_TOKEN || "";

const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    health: {
      executor: "constant-vus",
      vus: 20,
      duration: "15s",
      exec: "health",
      startTime: "0s",
    },
    auth_rps: {
      executor: "constant-arrival-rate",
      rate: 20,
      timeUnit: "1s",
      duration: "15s",
      preAllocatedVUs: 40,
      maxVUs: 80,
      exec: "authLogin",
      startTime: "0s",
    },
  },
  thresholds: {
    errors: ["rate<0.05"],
    http_req_failed: ["rate<0.15"],
  },
};

export function health() {
  const res = http.get(`${base}/api/system/health`);
  const ok = check(res, {
    "health 2xx": (r) => r.status >= 200 && r.status < 300,
    "no 500": (r) => r.status !== 500,
  });
  errorRate.add(!ok);
  sleep(0.1);
}

export function authLogin() {
  if (!user || !pass) {
    sleep(1);
    return;
  }
  const payload = JSON.stringify({ 0: { json: { username: user, password: pass } } });
  const res = http.post(`${base}/api/trpc/auth.login?batch=1`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  const ok = check(res, {
    "login no 500": (r) => r.status !== 500,
    "login respondeu": (r) => r.status > 0,
  });
  errorRate.add(!ok);
}

/** Opcional: com K6_SESSION_TOKEN + payload JSON em arquivo ou env */
export function pedidosCreate() {
  if (!token) return;
  const body = __ENV.K6_CREATE_VENDA_BODY;
  if (!body) return;
  const res = http.post(`${base}/api/trpc/pedidos.createVenda?batch=1`, body, {
    headers: {
      "Content-Type": "application/json",
      "X-Session-Token": token,
    },
  });
  check(res, { "create 2xx ou 4xx negócio": (r) => r.status !== 500 && r.status !== 504 });
}
