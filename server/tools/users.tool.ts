import * as usersService from '../services/users.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';

export const usersTool = {
  async getVendedorByNome(input: { nome: string }) {
    if (!input.nome) {
      throw new ValidationError('nome required');
    }
    return usersService.getVendedorByNome(input.nome);
  },

  async getUserByDisplayName(input: { displayName: string }) {
    if (!input.displayName) {
      throw new ValidationError('displayName required');
    }
    return usersService.getUserByDisplayName(input.displayName);
  }
};
