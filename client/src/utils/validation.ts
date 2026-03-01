/**
 * Utilitários para validação de formulários
 */

/**
 * Verifica se um valor está vazio
 * @param value Valor a ser verificado
 * @returns true se o valor estiver vazio, false caso contrário
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Verifica se um valor é um número válido
 * @param value Valor a ser verificado
 * @returns true se o valor for um número válido, false caso contrário
 */
export function isValidNumber(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return !isNaN(value);
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return !isNaN(parsed);
  }
  return false;
}

/**
 * Verifica se um valor é um e-mail válido
 * @param value Valor a ser verificado
 * @returns true se o valor for um e-mail válido, false caso contrário
 */
export function isValidEmail(value: string): boolean {
  if (isEmpty(value)) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Verifica se um valor é um telefone válido
 * @param value Valor a ser verificado
 * @returns true se o valor for um telefone válido, false caso contrário
 */
export function isValidPhone(value: string): boolean {
  if (isEmpty(value)) return false;
  // Remover caracteres não numéricos
  const digitsOnly = value.replace(/\D/g, '');
  // Verificar se tem pelo menos 10 dígitos (DDD + número)
  return digitsOnly.length >= 10;
}

/**
 * Verifica se um valor é um CPF válido
 * @param value Valor a ser verificado
 * @returns true se o valor for um CPF válido, false caso contrário
 */
export function isValidCPF(value: string): boolean {
  if (isEmpty(value)) return false;
  
  // Remover caracteres não numéricos
  const cpf = value.replace(/\D/g, '');
  
  // Verificar se tem 11 dígitos
  if (cpf.length !== 11) return false;
  
  // Verificar se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cpf)) return false;
  
  // Validar os dígitos verificadores
  let sum = 0;
  let remainder;
  
  // Primeiro dígito verificador
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(9, 10))) return false;
  
  // Segundo dígito verificador
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(10, 11))) return false;
  
  return true;
}

/**
 * Verifica se um valor é um CNPJ válido
 * @param value Valor a ser verificado
 * @returns true se o valor for um CNPJ válido, false caso contrário
 */
export function isValidCNPJ(value: string): boolean {
  if (isEmpty(value)) return false;
  
  // Remover caracteres não numéricos
  const cnpj = value.replace(/\D/g, '');
  
  // Verificar se tem 14 dígitos
  if (cnpj.length !== 14) return false;
  
  // Verificar se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cnpj)) return false;
  
  // Validar os dígitos verificadores
  let size = cnpj.length - 2;
  let numbers = cnpj.substring(0, size);
  const digits = cnpj.substring(size);
  let sum = 0;
  let pos = size - 7;
  
  // Primeiro dígito verificador
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  
  // Segundo dígito verificador
  size += 1;
  numbers = cnpj.substring(0, size);
  sum = 0;
  pos = size - 7;
  
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;
  
  return true;
}

/**
 * Verifica se um valor é um CEP válido
 * @param value Valor a ser verificado
 * @returns true se o valor for um CEP válido, false caso contrário
 */
export function isValidCEP(value: string): boolean {
  if (isEmpty(value)) return false;
  
  // Remover caracteres não numéricos
  const cep = value.replace(/\D/g, '');
  
  // Verificar se tem 8 dígitos
  return cep.length === 8;
}

/**
 * Validador de formulário
 * @param values Valores do formulário
 * @param rules Regras de validação
 * @returns Objeto com os erros encontrados
 */
export function validateForm<T extends Record<string, any>>(
  values: T,
  rules: Record<keyof T, (value: any) => string | null>
): FormErrors {
  const errors: FormErrors = {};
  
  for (const field in rules) {
    if (Object.prototype.hasOwnProperty.call(rules, field)) {
      const error = rules[field](values[field]);
      if (error) {
        errors[field] = error;
      }
    }
  }
  
  return errors;
}