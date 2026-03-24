/**
 * Script para testar a API de produtos
 */
const axios = require('axios');
require('dotenv').config();

async function testProdutosApi() {
  try {
    // Obter token de autenticação (se necessário)
    let token = '';
    try {
      const authResponse = await axios.post('http://localhost:3000/api/trpc/auth.login', {
        email: process.env.TEST_USER || 'admin@example.com',
        password: process.env.TEST_PASSWORD || 'admin123'
      });
      token = authResponse.data.result.data.token;
      console.log('Autenticação bem-sucedida');
    } catch (authError) {
      console.log('Aviso: Não foi possível autenticar, tentando sem autenticação');
    }

    // Configurar headers
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Testar endpoint de listagem de produtos
    console.log('\nTestando endpoint de produtos:');
    const response = await axios.get('http://localhost:3000/api/trpc/produtos.list?input={"limit":10,"offset":0}', { headers });
    
    // Verificar se a resposta é um array
    if (response.data && response.data.result && response.data.result.data) {
      const produtos = response.data.result.data;
      console.log(`✅ Resposta recebida com ${produtos.length} produtos`);
      
      // Verificar se o método find funciona no array
      try {
        const firstProduct = produtos.find(() => true);
        console.log('✅ Método find funciona no array de produtos');
        console.log('\nPrimeiro produto:', firstProduct);
      } catch (findError) {
        console.error('❌ Erro ao usar método find no array de produtos:', findError);
      }
    } else {
      console.error('❌ Resposta não contém dados de produtos');
      console.log('Resposta:', response.data);
    }
    
    console.log('\nTeste concluído com sucesso');
  } catch (error) {
    console.error('❌ Erro ao testar API de produtos:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Dados:', error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

testProdutosApi();