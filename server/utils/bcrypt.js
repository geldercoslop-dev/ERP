/**
 * Implementação simples de hash para senhas
 * ATENÇÃO: Esta é uma implementação básica e NÃO SEGURA para produção.
 * Use apenas em desenvolvimento até que o bcryptjs esteja funcionando corretamente.
 */

// Função simples para criar um hash a partir de uma string
function hash(data, rounds) {
  // Implementação básica de hash (não segura para produção)
  const salt = generateSalt(rounds);
  const hashedData = simpleHash(data + salt);
  return Promise.resolve(`$simple$${rounds}$${salt}$${hashedData}`);
}

// Função para verificar se um texto corresponde a um hash
function compare(data, hashedData) {
  if (!hashedData.startsWith('$simple$')) {
    // Se não for um hash simples, retorna falso
    return Promise.resolve(false);
  }
  
  const parts = hashedData.split('$');
  if (parts.length !== 5) {
    return Promise.resolve(false);
  }
  
  const rounds = parseInt(parts[2], 10);
  const salt = parts[3];
  const originalHash = parts[4];
  
  const newHash = simpleHash(data + salt);
  return Promise.resolve(newHash === originalHash);
}

// Função auxiliar para gerar um salt
function generateSalt(rounds) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  for (let i = 0; i < 16; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

// Função auxiliar para criar um hash simples
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// Exportação para ES modules
export {
  hash,
  compare
};