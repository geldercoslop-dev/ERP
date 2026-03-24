/**
 * Schemas de Validação - Zod Schemas para payloads
 * 
 * Use para validar dados antes de enviar ao backend
 */

import { z } from 'zod';

/**
 * Validadores de Campo Comuns
 */
export const CommonSchemas = {
  // String basico
  string: z.string().min(1, 'Campo obrigatório'),
  
  // Email
  email: z.string().email('Email inválido'),
  
  // Senha (mínimo 8 caracteres, 1 maiúscula, 1 número)
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Deve conter letra maiúscula')
    .regex(/[0-9]/, 'Deve conter número'),
  
  // UUID
  uuid: z.string().uuid('UUID inválido'),
  
  // URL
  url: z.string().url('URL inválida'),
  
  // Data ISO
  date: z.string().datetime('Data inválida'),
  
  // Telefone (internacional)
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Telefone inválido'),
  
  // CPF
  cpf: z
    .string()
    .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, 'CPF inválido'),
  
  // CNPJ
  cnpj: z
    .string()
    .regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, 'CNPJ inválido'),
  
  // Número positivo
  positiveNumber: z.number().positive('Deve ser maior que 0'),
  
  // Número não-negativo
  nonNegativeNumber: z.number().nonnegative('Não pode ser negativo'),
};

/**
 * Login Schema
 */
export const LoginSchema = z.object({
  email: CommonSchemas.email,
  password: z.string().min(1, 'Senha obrigatória'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginPayload = z.infer<typeof LoginSchema>;

/**
 * Register Schema
 */
export const RegisterSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres').max(100, 'Máximo 100 caracteres'),
  email: CommonSchemas.email,
  password: CommonSchemas.password,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
});

export type RegisterPayload = z.infer<typeof RegisterSchema>;

/**
 * Update Profile Schema
 */
export const UpdateProfileSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres').max(100, 'Máximo 100 caracteres').optional(),
  email: CommonSchemas.email.optional(),
  phone: CommonSchemas.phone.optional(),
  avatar: z.string().url().optional(),
  bio: z.string().max(500, 'Máximo 500 caracteres').optional(),
}).strict();

export type UpdateProfilePayload = z.infer<typeof UpdateProfileSchema>;

/**
 * Criar Produto Schema (exemplo)
 */
export const CreateProductSchema = z.object({
  name: z.string().min(3, 'Mínimo 3 caracteres').max(200, 'Máximo 200 caracteres'),
  description: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
  price: CommonSchemas.positiveNumber,
  stock: CommonSchemas.nonNegativeNumber,
  category: z.string().uuid('Category ID inválido'),
  images: z.array(z.string().url()).min(1, 'Mínimo 1 imagem').max(10, 'Máximo 10 imagens'),
  sku: z.string().regex(/^[A-Z0-9\-]+$/, 'SKU inválido').optional(),
}).strict();

export type CreateProductPayload = z.infer<typeof CreateProductSchema>;

/**
 * Busca/Filtro Schema
 */
export const SearchQuerySchema = z.object({
  q: z.string().max(100, 'Máximo 100 caracteres').optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
}).strict();

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/**
 * Pagination Schema
 */
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().nonnegative().optional(),
}).strict();

export type Pagination = z.infer<typeof PaginationSchema>;

/**
 * Validar payload antes de enviar
 * @returns { valid, data, error }
 */
export function validatePayload<T>(schema: z.ZodSchema, payload: unknown): {
  valid: boolean;
  data?: T;
  error?: string;
} {
  try {
    const data = schema.parse(payload);
    return { valid: true, data: data as T };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return { valid: false, error: message };
    }
    return { valid: false, error: 'Validação falhou' };
  }
}

/**
 * Hook para validação (React)
 */
export function useValidate<T>(schema: z.ZodSchema) {
  return (payload: unknown) => {
    return validatePayload<T>(schema, payload);
  };
}
