/**
 * Script legado de massa automática — DESATIVADO.
 *
 * Motivo: segurança multi-tenant. A versão anterior dependia de um tenant
 * padrão vindo de variável de ambiente, buscava vendedores sem filtro de
 * tenant e podia vincular dados a outro tenant ou criar registros sem
 * vínculo. Foi bloqueada para evitar vínculo cross-tenant e criação
 * acidental de dados.
 *
 * Para criar massa de teste, use o cadastro via UI/fluxo oficial da aplicação.
 * Uma versão segura deste script só poderá ser reintroduzida mediante janela
 * formal autorizada pelo arquiteto.
 */
console.error(
  "[seed-massa-teste] BLOQUEADO: a massa automática antiga foi desativada por segurança multi-tenant.\n" +
  "[seed-massa-teste] Crie massa de teste via UI/fluxo oficial até existir uma versão segura deste script."
);
process.exit(1);
