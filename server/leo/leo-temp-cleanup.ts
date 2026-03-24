export const leoTempCleanup = {
  async limparArquivosTemporarios(): Promise<{ success: boolean; message: string; cleaned?: number }> {
    // Implementação mínima para manter tipagem e evitar falhas de import.
    // O cleanup real pode ser adicionado depois sem alterar o contrato.
    return { success: true, message: "Sem limpeza pendente", cleaned: 0 };
  },
};

