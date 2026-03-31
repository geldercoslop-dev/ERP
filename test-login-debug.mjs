#!/usr/bin/env node
/**
 * Debug: Teste simples de login
 */
async function testLogin() {
  const url = "http://localhost:3000/api/trpc/auth.login";
  const payload = {
    json: {
      username: "admin",
      password: "admin123"
    }
  };

  console.log("URL:", url);
  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("\nFazendo request...\n");

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("Status:", resp.status);
    console.log("Headers:", Object.fromEntries(Array.from(resp.headers)));

    const text = await resp.text();
    console.log("Response (raw):", text.slice(0, 500));

    if (text) {
      try {
        const json = JSON.parse(text);
        console.log("\nResponse (json):");
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {
        console.log("Falha ao parse JSON:", e.message);
      }
    }
  } catch (error) {
    console.error("Erro:", error.message);
  }
}

console.log("🔍 Testando login...\n");
testLogin();
