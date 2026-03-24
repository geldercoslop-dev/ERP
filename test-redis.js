import redis from 'redis';

async function testRedis() {
  const client = redis.createClient({
    socket: {
      host: '127.0.0.1',
      port: 6379
    }
  });

  client.on('error', (err) => {
    console.log('Redis Error:', err.message);
    if (err.message.includes('ECONNREFUSED')) {
      console.log('❌ Redis não está rodando');
      process.exit(1);
    }
  });

  try {
    await client.connect();
    console.log('✅ Redis conectado');
    
    const pong = await client.ping();
    console.log('✅ PING ->', pong);
    
    await client.quit();
    console.log('✅ Redis OK para produção');
  } catch (error) {
    console.log('❌ Erro Redis:', error.message);
    process.exit(1);
  }
}

testRedis();
