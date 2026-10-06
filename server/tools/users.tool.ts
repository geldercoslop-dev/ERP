import * as usersService from '../services/users.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
import { assertTenantId } from '../_core/errors/assertions.js';

export const usersTool = {
  async getVendedorByNome(input: { tenantId: number; nome: string }) {
    assertTenantId(input.tenantId);
    if (!input.nome) {
      throw new ValidationError('nome required');
    }
    return usersService.getVendedorByNome(input.tenantId, input.nome);
  },

  async getUserByDisplayName(input: { tenantId: number; displayName: string }) {
    assertTenantId(input.tenantId);
    if (!input.displayName) {
      throw new ValidationError('displayName required');
    }
    return usersService.getUserByDisplayName(input.tenantId, input.displayName);
  }
};
