/**
 * Schemas de Validação com Zod
 * Validação forte de formulários em todas as telas
 * Sem `any` - tipagem 100% forte
 */

import { z } from 'zod';

/**
 * Cliente - Schema de criação
 */
export const ClienteCreateSchema = z.object({
  nome: z
    .string()
    .min(1, 'Nome é obrigatório')
    .min(3, 'Nome deve ter pelo menos 3 caracteres')
    .max(200, 'Nome não pode exceder 200 caracteres'),
  telefone: z
    .string()
    .min(1, 'Telefone é obrigatório')
    .regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos'),
  telefoneRecado: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{10,11}$/.test(v),
      'Telefone de recado deve ter 10 ou 11 dígitos'
    ),
  cpf: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^\d{11}$/.test(v.replace(/\D/g, '')),
      'CPF deve ter 11 dígitos'
    ),
  cep: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{8}$/.test(v.replace(/\D/g, '')), 'CEP inválido'),
  rua: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Z]{2}$/.test(v), 'UF deve ter 2 letras'),
  referencia: z.string().optional(),
});

export type ClienteCreateInput = z.infer<typeof ClienteCreateSchema>;

/**
 * Pedido - Schema de criação
 */
export const PedidoCreateSchema = z.object({
  numeroNF: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), 'Número deve conter apenas dígitos'),
  dataEmissao: z.string().optional(),
  dataVencimento: z.string().optional(),
  clienteId: z.number().optional(),
  clienteNome: z.string().optional(),
  valor: z.number().positive('Valor deve ser positivo').optional(),
  status: z
    .enum(['pendente', 'processando', 'concluído', 'cancelado'])
    .optional(),
  observacoes: z.string().optional(),
});

export type PedidoCreateInput = z.infer<typeof PedidoCreateSchema>;

/**
 * Pagamento - Schema de criação
 */
export const PagamentoCreateSchema = z.object({
  pedidoId: z.number().optional(),
  numeroPedido: z.string().optional(),
  valor: z.number().positive('Valor deve ser positivo').optional(),
  dataPagamento: z.string().optional(),
  dataVencimento: z.string().optional(),
  status: z.enum(['pendente', 'pago', 'vencido', 'cancelado']).optional(),
  formaPagamento: z
    .enum(['dinheiro', 'cartao', 'boleto', 'transferencia', 'cheque'])
    .optional(),
  referencia: z.string().optional(),
  observacoes: z.string().optional(),
});

export type PagamentoCreateInput = z.infer<typeof PagamentoCreateSchema>;

/**
 * Login - Schema de validação
 */
export const LoginSchema = z.object({
  username: z.string().min(1, 'Usuário é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * Função auxiliar para validar dados
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): { valid: boolean; data?: T; errors?: Record<string, string> } {
  try {
    const validData = schema.parse(data);
    return { valid: true, data: validData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      return { valid: false, errors };
    }
    return { valid: false, errors: { _root: 'Erro de validação desconhecido' } };
  }
}

/**
 * Função para formatar mensagens de erro de validação
 */
export function formatValidationErrors(errors?: Record<string, string>): string[] {
  if (!errors) return [];
  return Object.entries(errors).map(([field, message]) =>
    field === '_root' ? message : `${field}: ${message}`
  );
}
