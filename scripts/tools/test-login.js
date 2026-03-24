// Script para testar o login via API.
// Use: TEST_LOGIN_USER=admin TEST_LOGIN_PASSWORD=sua_senha npm run test:login

async function testLogin() {
  const username = process.env.TEST_LOGIN_USER || "";
  const password = process.env.TEST_LOGIN_PASSWORD || "";
  const url = process.env.TEST_LOGIN_URL || "http://localhost:3000/api/trpc/auth.login?batch=1";

  if (!username || !password) {
    console.log("Defina TEST_LOGIN_USER e TEST_LOGIN_PASSWORD no ambiente.");
    process.exit(1);
  }

  try {
    console.log("Testando login em", url.replace(/\/[^/]*$/, "/..."), "com usuário", username, "...");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        0: { json: { username, password } },
      }),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log("Resposta não é JSON.");
      process.exit(1);
    }

    const ok = data?.[0]?.result?.data?.json?.ok === true;
    if (ok) {
      console.log("Login bem-sucedido.");
    } else {
      console.log("Falha no login ou resposta inesperada.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Erro ao testar login:", error);
    process.exit(1);
  }
}

testLogin();
