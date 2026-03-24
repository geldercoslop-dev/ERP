/**
 * Aplica o mapeamento de colunas (camelCase -> snake_case) no código.
 * Foco: `drizzle/schema.ts` + strings SQL mais comuns.
 *
 * Uso:
 *   pnpm exec tsx scripts/apply-column-mapping-to-code.ts normalize-columns-mapping.json
 */
import * as fs from "fs";
import * as path from "path";

type MappingFile = {
  db: string;
  mapping: Record<string, Record<string, string>>;
};

function replaceAllSafe(haystack: string, from: string, to: string): string {
  // Troca somente ocorrências exatas em strings/identificadores (simples, mas útil)
  return haystack.split(from).join(to);
}

function main() {
  const mapPath = process.argv[2];
  if (!mapPath) {
    console.error("Uso: tsx scripts/apply-column-mapping-to-code.ts <mapping.json>");
    process.exit(1);
  }

  const abs = path.isAbsolute(mapPath) ? mapPath : path.join(process.cwd(), mapPath);
  const data = JSON.parse(fs.readFileSync(abs, "utf8")) as MappingFile;

  // Flatten mapping (colName -> newName)
  const pairs: Array<{ from: string; to: string }> = [];
  for (const table of Object.keys(data.mapping || {})) {
    const cols = data.mapping[table] || {};
    for (const from of Object.keys(cols)) {
      pairs.push({ from, to: cols[from] });
    }
  }

  // Ordenar por comprimento desc para evitar substituições parciais
  pairs.sort((a, b) => b.from.length - a.from.length);

  const files = [
    path.join(process.cwd(), "drizzle", "schema.ts"),
    path.join(process.cwd(), "server", "modules", "safe-shipment.module.ts"),
    path.join(process.cwd(), "server", "modules", "safe-payment.module.ts"),
    path.join(process.cwd(), "server", "scripts", "validate-idempotency-table.ts"),
  ].filter((p) => fs.existsSync(p));

  for (const file of files) {
    const before = fs.readFileSync(file, "utf8");
    let after = before;

    for (const { from, to } of pairs) {
      // drizzle/schema.ts: trocar nomes físicos em quotes: "createdAt" -> "created_at"
      after = replaceAllSafe(after, `"${from}"`, `"${to}"`);
      after = replaceAllSafe(after, `'${from}'`, `'${to}'`);
      after = replaceAllSafe(after, `\`${from}\``, `\`${to}\``);

      // Strings SQL comuns (sem quotes)
      after = replaceAllSafe(after, ` ${from} `, ` ${to} `);
      after = replaceAllSafe(after, `${from}=`, `${to}=`);
      after = replaceAllSafe(after, `.${from}`, `.${to}`);
    }

    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      console.log(`[code] updated: ${path.relative(process.cwd(), file)}`);
    } else {
      console.log(`[code] no changes: ${path.relative(process.cwd(), file)}`);
    }
  }
}

main();

