import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const forbidden = /\bany\b/;

const scan = (dir: string): void => {
  const entries = readdirSync(dir);

  for (const file of entries) {
    const full = join(dir, file);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      scan(full);
      continue;
    }

    if (file.endsWith(".ts")) {
      const content = readFileSync(full, "utf-8");
      if (forbidden.test(content)) {
        process.stderr.write(`ANY FOUND: ${full}\n`);
        process.exit(1);
      }
    }
  }
};

scan("src");
