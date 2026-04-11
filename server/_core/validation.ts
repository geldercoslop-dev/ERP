import { z } from 'zod';
import { authLogger } from './logger.js';
import { ValidationError } from './errors/typed-errors.js';

// Schema para validação de login
export const loginSchema = z.object({
  username: z.string()
    .min(1, 'Usuário é obrigatório')
    .max(50, 'Usuário deve ter no máximo 50 caracteres')
    .transform(val => val.trim().toLowerCase()),
  password: z.string()
    .min(1, 'Senha é obrigatória')
    .max(100, 'Senha deve ter no máximo 100 caracteres')
});

// Schema para validação de clientes
export const clienteSchema = z.object({
  nome: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .transform(val => val.trim()),
  telefone: z.string()
    .max(20, 'Telefone deve ter no máximo 20 caracteres')
    .regex(/^\d*$/, 'Telefone deve conter apenas números')
    .optional()
    .nullable(),
  telefoneRecado: z.string()
    .max(20, 'Telefone de recado deve ter no máximo 20 caracteres')
    .regex(/^\d*$/, 'Telefone de recado deve conter apenas números')
    .optional()
    .nullable(),
  rua: z.string()
    .max(150, 'Rua deve ter no máximo 150 caracteres')
    .optional()
    .nullable(),
  numero: z.string()
    .max(20, 'Número deve ter no máximo 20 caracteres')
    .optional()
    .nullable(),
  bairro: z.string()
    .max(100, 'Bairro deve ter no máximo 100 caracteres')
    .optional()
    .nullable(),
  cidade: z.string()
    .max(100, 'Cidade deve ter no máximo 100 caracteres')
    .optional()
    .nullable(),
  uf: z.string()
    .length(2, 'UF deve ter exatamente 2 caracteres')
    .regex(/^[A-Z]{2}$/, 'UF deve conter apenas letras maiúsculas')
    .optional()
    .nullable(),
  referencia: z.string()
    .max(200, 'Referência deve ter no máximo 200 caracteres')
    .optional()
    .nullable(),
  condominio: z.string()
    .max(100, 'Condomínio deve ter no máximo 100 caracteres')
    .optional()
    .nullable(),
  bloco: z.string()
    .max(20, 'Bloco deve ter no máximo 20 caracteres')
    .optional()
    .nullable(),
  apartamento: z.string()
    .max(20, 'Apartamento deve ter no máximo 20 caracteres')
    .optional()
    .nullable()
});

// Schema para validação de itens de pedido
export const pedidoItemSchema = z.object({
  tipo: z.enum(['LIVRE', 'CATALOGO'], { message: 'Tipo deve ser LIVRE ou CATALOGO' }),
  produtoId: z.number()
    .int('ID do produto deve ser um número inteiro')
    .positive('ID do produto deve ser positivo')
    .optional()
    .nullable(),
  corId: z.number()
    .int('ID da cor deve ser um número inteiro')
    .positive('ID da cor deve ser positivo')
    .optional()
    .nullable(),
  corNome: z.string()
    .max(50, 'Nome da cor deve ter no máximo 50 caracteres')
    .optional()
    .nullable(),
  descricao: z.string()
    .min(1, 'Descrição do item é obrigatória')
    .max(200, 'Descrição deve ter no máximo 200 caracteres')
    .transform(val => val.trim()),
  marca: z.string()
    .max(100, 'Marca deve ter no máximo 100 caracteres')
    .optional()
    .nullable(),
  quantidade: z.number()
    .int('Quantidade deve ser um número inteiro')
    .min(1, 'Quantidade deve ser pelo menos 1')
    .max(9999, 'Quantidade deve ser no máximo 9999'),
  valorUnitario: z.number()
    .min(0, 'Valor unitário não pode ser negativo')
    .refine(val => Number(val.toFixed(2)) === val, 'Valor unitário deve ter no máximo 2 casas decimais'),
  custo: z.number()
    .min(0, 'Custo não pode ser negativo')
    .refine(val => Number(val.toFixed(2)) === val, 'Custo deve ter no máximo 2 casas decimais')
    .optional()
    .nullable(),
  prazoGarantia: z.number()
    .int('Prazo de garantia deve ser um número inteiro')
    .min(0, 'Prazo de garantia não pode ser negativo')
    .max(360, 'Prazo de garantia deve ser no máximo 360 dias')
    .optional()
    .nullable(),
  isPremio: z.boolean().optional().default(false)
});

// Schema para validação de pagamentos
export const pagamentoSchema = z.object({
  tipo: z.enum(['PIX', 'DINHEIRO', 'CARTAO', 'BOLETO', 'A_DEFINIR'], { message: 'Tipo de pagamento inválido' }),
  valor: z.number()
    .min(0, 'Valor não pode ser negativo')
    .refine(val => Number(val.toFixed(2)) === val, 'Valor deve ter no máximo 2 casas decimais')
    .optional()
    .nullable()
});

// Schema para validação de pagamento combinado
export const pagamentoCombinadoSchema = z.object({
  tipo: z.enum(['BOLETO', 'CARTAO', 'ENTRADA_BOLETO', 'ENTRADA_CARTAO'], { message: 'Tipo de pagamento combinado inválido' }),
  entradaValor: z.number()
    .min(0, 'Valor de entrada não pode ser negativo')
    .refine(val => Number(val.toFixed(2)) === val, 'Valor de entrada deve ter no máximo 2 casas decimais')
    .optional()
    .nullable(),
  boletoParcelas: z.number()
    .int('Número de parcelas deve ser um número inteiro')
    .min(1, 'Número de parcelas deve ser pelo menos 1')
    .max(24, 'Número de parcelas deve ser no máximo 24')
    .optional()
    .nullable(),
  boletoVencimentos: z.array(z.date()).optional().nullable(),
  boletoPrimeiroVencimento: z.date().optional().nullable()
});

// Schema principal para validação de pedidos
export const pedidoSchema = z.object({
  vendedorId: z.number()
    .int('ID do vendedor deve ser um número inteiro')
    .positive('ID do vendedor deve ser positivo')
    .optional()
    .nullable(),
  clienteId: z.number()
    .int('ID do cliente deve ser um número inteiro')
    .positive('ID do cliente deve ser positivo')
    .optional()
    .nullable(),
  cliente: clienteSchema.optional(),
  subtotal: z.number()
    .min(0, 'Subtotal não pode ser negativo')
    .refine(val => Number(val.toFixed(2)) === val, 'Subtotal deve ter no máximo 2 casas decimais'),
  desconto: z.number()
    .min(0, 'Desconto não pode ser negativo')
    .refine(val => Number(val.toFixed(2)) === val, 'Desconto deve ter no máximo 2 casas decimais')
    .default(0),
  frete: z.number()
    .min(0, 'Frete não pode ser negativo')
    .refine(val => Number(val.toFixed(2)) === val, 'Frete deve ter no máximo 2 casas decimais')
    .default(0),
  total: z.number()
    .min(0.01, 'Total deve ser maior que zero')
    .refine(val => Number(val.toFixed(2)) === val, 'Total deve ter no máximo 2 casas decimais'),
  pagamentos: z.array(pagamentoSchema).optional(),
  pagamentoCombinado: pagamentoCombinadoSchema.optional(),
  observacoes: z.string()
    .max(500, 'Observações devem ter no máximo 500 caracteres')
    .optional()
    .nullable(),
  itens: z.array(pedidoItemSchema)
    .min(1, 'Pedido deve ter pelo menos um item')
    .refine(
      (items) => items.every(item => Number((item.quantidade * item.valorUnitario).toFixed(2)) === Number((item.quantidade * item.valorUnitario).toFixed(2))),
      'Valores dos itens devem ter no máximo 2 casas decimais'
    ),
  idempotencyKey: z.string()
    .max(64, 'Chave de idempotência deve ter no máximo 64 caracteres')
    .optional()
});

// Função para validar dados com log de erro
export function validateWithLog<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T {
  try {
    const result = schema.parse(data);
    authLogger.debug({ context, valid: true }, 'Validation successful');
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));
      
      authLogger.error({ 
        context, 
        errors, 
        invalidData: data 
      }, 'Validation failed');
      
      throw new ValidationError(`Validação falhou: ${errors.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(', ')}`);
    }
    
    authLogger.error({ context, error }, 'Unexpected validation error');
    throw error;
  }
}
