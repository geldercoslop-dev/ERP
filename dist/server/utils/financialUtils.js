/**
 * Utilitários para cálculos financeiros com precisão
 *
 * Evita erros de ponto flutuante do JavaScript usando arredondamento correto
 */
import { ValidationError } from '../_core/errors/typed-errors.js';
/**
 * Arredonda um valor para 2 casas decimais
 * @param value Valor a ser arredondado
 * @returns Valor arredondado para 2 casas decimais
 */
export function roundToTwo(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
/**
 * Soma valores com precisão de 2 casas decimais
 * @param values Array de valores a serem somados
 * @returns Soma arredondada para 2 casas decimais
 */
export function sumWithPrecision(values) {
    const sum = values.reduce((acc, val) => acc + val, 0);
    return roundToTwo(sum);
}
/**
 * Subtrai valores com precisão de 2 casas decimais
 * @param value Valor base
 * @param subtract Valor a ser subtraído
 * @returns Resultado arredondado para 2 casas decimais
 */
export function subtractWithPrecision(value, subtract) {
    return roundToTwo(value - subtract);
}
/**
 * Multiplica valores com precisão de 2 casas decimais
 * @param a Primeiro valor
 * @param b Segundo valor
 * @returns Produto arredondado para 2 casas decimais
 */
export function multiplyWithPrecision(a, b) {
    return roundToTwo(a * b);
}
/**
 * Divide valores com precisão de 2 casas decimais
 * @param dividend Dividendo
 * @param divisor Divisor
 * @returns Quociente arredondado para 2 casas decimais
 */
export function divideWithPrecision(dividend, divisor) {
    if (divisor === 0) {
        throw new ValidationError("Divisão por zero");
    }
    return roundToTwo(dividend / divisor);
}
/**
 * Calcula o valor com desconto
 * @param value Valor original
 * @param discount Valor do desconto
 * @returns Valor com desconto aplicado
 */
export function applyDiscount(value, discount) {
    return subtractWithPrecision(value, discount);
}
/**
 * Calcula o valor com desconto percentual
 * @param value Valor original
 * @param discountPercent Percentual de desconto (0-100)
 * @returns Valor com desconto percentual aplicado
 */
export function applyDiscountPercent(value, discountPercent) {
    const discountValue = multiplyWithPrecision(value, discountPercent / 100);
    return applyDiscount(value, discountValue);
}
/**
 * Calcula o valor com imposto
 * @param value Valor original
 * @param taxRate Taxa de imposto (percentual 0-100)
 * @returns Valor com imposto aplicado
 */
export function applyTax(value, taxRate) {
    const taxValue = multiplyWithPrecision(value, taxRate / 100);
    return sumWithPrecision([value, taxValue]);
}
/**
 * Converte string de moeda para número
 * @param moneyString String no formato "1.234,56" ou "1234,56"
 * @returns Valor numérico
 */
export function parseMoneyString(moneyString) {
    if (!moneyString)
        return 0;
    // Remover símbolos de moeda e espaços
    const cleaned = moneyString.replace(/[^\d,.-]/g, '');
    // Converter para o formato que o parseFloat entende
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    // Converter para número e arredondar
    return roundToTwo(parseFloat(normalized) || 0);
}
/**
 * Formata um número para string de moeda
 * @param value Valor numérico
 * @returns String formatada no padrão brasileiro (1.234,56)
 */
export function formatMoney(value) {
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
