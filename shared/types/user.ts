/**
 * Tipos de usuário e auth — entidades (User, Vendedor) vêm de entities.ts
 */
import type { users } from "./entities";

type UserType = typeof users.$inferSelect;

export type User = UserType;

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  role?: "admin" | "user";
}

export interface UpdateUserData {
  username?: string;
  email?: string;
  password?: string;
  role?: "admin" | "user";
  active?: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresIn: number;
}
