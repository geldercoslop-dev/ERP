/**
 * Padrão: após create/update/delete, invalidar as queries de lista para a tela refletir sem reload.
 * Ex.: invalidateAfterMutation(utils, ["vendedores.list", "cargas.list"])
 */
export async function invalidateAfterMutation(
  utils: { [k: string]: { [j: string]: { invalidate?: () => Promise<unknown> } } },
  keys: string[]
): Promise<void> {
  await Promise.all(
    keys.map((key) => {
      const parts = key.split(".");
      let target: any = utils;
      for (const p of parts) target = target?.[p];
      return target?.invalidate?.() ?? Promise.resolve();
    })
  );
}
