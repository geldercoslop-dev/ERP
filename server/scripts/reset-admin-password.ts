/**
 * [DESABILITADO - P23-R-09R] Script de reset direto de credencial de acesso inicial.
 *
 * Este script aplicava uma credencial fixa fraca, imprimia a senha em plaintext,
 * fazia busca sem escopo de tenant e inseria registros com tenant hardcoded.
 * O comportamento foi bloqueado por seguranca. Nao executa mais nenhuma acao
 * de banco de dados.
 *
 * Para provisionar o acesso inicial, use o fluxo oficial de bootstrap/admin-init.
 * Para rotacao de credenciais, use a rotina segura de administracao definida
 * em fase propria.
 */

console.log("[reset-admin] DESABILITADO por seguranca (P23-R-09R).");
console.log("[reset-admin] Reset direto de credencial com valor fixo foi removido.");
console.log("[reset-admin] Use o fluxo oficial de bootstrap/admin-init para provisionamento inicial.");
console.log("[reset-admin] Para rotacao de credenciais, siga a rotina segura de administracao.");

process.exit(1);
