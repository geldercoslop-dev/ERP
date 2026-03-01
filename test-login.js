// Script para testar o login via API

async function testLogin() {
  try {
    const username = "admin";
    const password = "admin123";
    const url = "http://localhost:3000/api/trpc/auth.login?batch=1";

    console.log(`Testando login em ${url} com usuário ${username}...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        0: {
          json: {
            username,
            password,
          }
        }
      })
    });

    const setCookie = response.headers.get("set-cookie") || "";
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log("Resposta bruta do servidor:", text);
      return;
    }

    console.log("Resposta do servidor:", JSON.stringify(data, null, 2));

    const ok = data?.[0]?.result?.data?.json?.ok === true;
    if (ok) {
      console.log("Login bem-sucedido!");
      if (setCookie) {
        const meResponse = await fetch("http://localhost:3000/api/trpc/auth.me", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            cookie: setCookie,
          },
        });
        const meText = await meResponse.text();
        try {
          const meData = JSON.parse(meText);
          console.log("Resposta auth.me:", JSON.stringify(meData, null, 2));
        } catch {
          console.log("Resposta auth.me bruta:", meText);
        }
      }
    } else {
      console.log("Falha no login ou resposta inesperada.");
    }
  } catch (error) {
    console.error("Erro ao testar login:", error);
  }
}

testLogin();
