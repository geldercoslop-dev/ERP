export function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

export function maskPhoneBr(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (!d) return "";
  const ddd = d.slice(0, 2);
  const part1 = d.slice(2, 7);
  const part2 = d.slice(7, 11);
  if (d.length <= 2) return `(${ddd}`;
  if (d.length <= 7) return `(${ddd}) ${part1}`;
  return `(${ddd}) ${part1}-${part2}`;
}

export function isPhoneCompleteBr(v: string) {
  return /^\(\d{2}\) \d{5}-\d{4}$/.test((v || "").trim());
}

export function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (!d) return "";
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 9);
  const e = d.slice(9, 11);
  if (d.length <= 3) return a;
  if (d.length <= 6) return `${a}.${b}`;
  if (d.length <= 9) return `${a}.${b}.${c}`;
  return `${a}.${b}.${c}-${e}`;
}

export function maskCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  if (!d) return "";
  const a = d.slice(0, 5);
  const b = d.slice(5, 8);
  if (d.length <= 5) return a;
  return `${a}-${b}`;
}

export function maskMoney(v: string) {
  const digits = v.replace(/\D/g, "");
  const num = (Number(digits) / 100).toFixed(2).replace(".", ",");
  return num.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}

export function parseMoney(v: string) {
  const n = Number((v || "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
