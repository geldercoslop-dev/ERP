/**
 * Aplicação de proteção a todos os serviços
 * 
 * Este módulo aplica proteção a todos os serviços existentes
 * para garantir que nenhum serviço retorne valores inválidos.
 */
import { protectService } from './service-protection';

/**
 * Aplica proteção a um serviço específico
 * @param servicePath - O caminho para o módulo do serviço
 * @returns Uma função que aplica proteção ao serviço
 */
export async function protectServiceModule(servicePath: string): Promise<void> {
  try {
    const serviceModule = await import(servicePath);
    const serviceName = servicePath.split('/').pop()?.replace('.ts', '') || servicePath;
    
    console.log(`Aplicando proteção ao serviço: ${serviceName}`);
    
    // Proteger cada função exportada pelo módulo
    Object.keys(serviceModule).forEach(key => {
      if (typeof serviceModule[key] === 'function') {
        const originalFn = serviceModule[key];
        
        // Substituir a função original por uma versão protegida
        serviceModule[key] = function(...args: any[]) {
          try {
            const result = originalFn.apply(this, args);
            
            // Se for uma Promise, garantir que o resultado seja seguro
            if (result instanceof Promise) {
              return result.then(
                (resolvedValue) => {
                  // Verificar se o resultado é undefined
                  if (resolvedValue === undefined) {
                    console.warn(`SERVICE_PROTECTION_WARNING: Método ${key} do serviço ${serviceName} retornou undefined`);
                    
                    // Retornar valor padrão seguro com base no nome do método
                    if (key.includes('list') || key.includes('All') || key.includes('By') || key.includes('get')) {
                      return [];
                    }
                    if (key.includes('create')) {
                      return { id: -1 }; // ID inválido para indicar erro
                    }
                    if (key.includes('update') || key.includes('delete')) {
                      return { success: false };
                    }
                    return null;
                  }
                  
                  // Verificar se o resultado deve ser um array
                  if ((key.includes('list') || key.includes('All') || key.includes('By')) && !Array.isArray(resolvedValue)) {
                    console.warn(`SERVICE_PROTECTION_WARNING: Método ${key} do serviço ${serviceName} deveria retornar um array, mas retornou ${typeof resolvedValue}`);
                    return [];
                  }
                  
                  return resolvedValue;
                },
                (error) => {
                  console.error(`SERVICE_PROTECTION_ERROR: Erro no método ${key} do serviço ${serviceName}`, error);
                  throw error;
                }
              );
            }
            
            return result;
          } catch (error) {
            console.error(`SERVICE_PROTECTION_ERROR: Erro ao executar ${key} do serviço ${serviceName}`, error);
            throw error;
          }
        };
      }
    });
    
    console.log(`Serviço ${serviceName} protegido com sucesso`);
  } catch (error) {
    console.error(`Erro ao proteger serviço ${servicePath}:`, error);
  }
}

/**
 * Aplica proteção a todos os serviços conhecidos
 */
export async function protectAllServices(): Promise<void> {
  const serviceModules = [
    '../services/clientes.service',
    '../services/inventory.service',
    '../services/orders.service',
    '../services/finance.service',
    '../services/stock-safety.service',
    // Adicionar outros serviços conforme necessário
  ];
  
  console.log('Iniciando proteção de todos os serviços...');
  
  for (const servicePath of serviceModules) {
    await protectServiceModule(servicePath);
  }
  
  console.log('Todos os serviços foram protegidos com sucesso');
}