import { createClient } from 'redis';

async function testRedis() {
  const client = createClient({
    socket: {
      host: 'localhost',
      port: 6379
    }
  });

  client.on('error', (err) => {
    console.error('❌ Redis Error:', err.message);
    process.exit(1);
  });

  try {
    await client.connect();
    console.log('✅ Redis conectado');
    
    const pong = await client.ping();
    console.log('✅ PING ->', pong);
    
    // Teste de escrita/leitura
    await client.set('test:deploy', 'OK');
    const value = await client.get('test:deploy');
    console.log('✅ SET/GET ->', value);
    
    await client.quit();
    console.log('✅ Redis OK para produção');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro Redis:', error.message);
    process.exit(1);
  }
}

testRedis();
