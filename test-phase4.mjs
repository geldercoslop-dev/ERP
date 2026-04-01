
const BASE_URL = 'http://localhost:3000';

async function run() {
  console.log('--- FASE 4: TESTE REAL (BATCH FORMAT) ---');
  
  try {
    // 1. Get CSRF Token
    console.log('1. Obtendo token CSRF...');
    const csrfRes = await fetch(`${BASE_URL}/api/csrf-token`);
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken;
    const setCookie = csrfRes.headers.get('set-cookie');
    const csrfCookie = setCookie.split(';')[0];
    console.log('   OK. Token:', csrfToken.substring(0, 10) + '...');

    // 2. Login
    console.log('2. Realizando login como admin (BATCH)...');
    const loginRes = await fetch(`${BASE_URL}/api/trpc/auth.login?batch=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        'cookie': csrfCookie
      },
      body: JSON.stringify({
        0: {
          json: {
            username: 'admin',
            password: 'admin123'
          }
        }
      })
    });

    const loginData = await loginRes.json();
    console.log('   Response:', JSON.stringify(loginData, null, 2));

    if (loginData.error || loginData[0]?.error) {
      console.error('   ERRO:', loginData.error || loginData[0]?.error);
      return;
    }
    console.log('   OK. Login realizado com sucesso.');

    const loginCookies = loginRes.headers.getSetCookie();
    const sessionCookie = loginCookies.find(c => c.startsWith('vendas-session=') || c.startsWith('session=')).split(';')[0];
    const combinedCookies = `${csrfCookie}; ${sessionCookie}`;

    // 3. Listar Produtos
    console.log('3. Listando produtos...');
    const productsRes = await fetch(`${BASE_URL}/api/trpc/produtos.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%7D%7D%7D`, {
      headers: {
        'cookie': combinedCookies
      }
    });
    const productsData = await productsRes.json();
    const items = productsData[0]?.result?.data?.json?.items || [];
    console.log(`   OK. Encontrados ${items.length} produtos.`);

    console.log('\n--- FASE 4 CONCLUÍDA COM SUCESSO ---');
  } catch (error) {
    console.error('\n❌ ERRO NO FLUXO:', error.message);
  }
}

run();
