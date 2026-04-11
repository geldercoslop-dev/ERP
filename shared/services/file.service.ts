import { readdirSync, readFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { extname, join } from "node:path";
import { processFile, type FileInput, type ProcessedFile, type Result } from "../core/processor.js";

export type ServiceProcessResult = {
  filePath: string;
  result: Result<ProcessedFile>;
};

function isIgnoredDir(name: string): boolean {
  return name === "node_modules" || name === "dist";
}

function toRelativePath(rootDir: string, filePath: string): string {
  return filePath.replace(`${rootDir}\\`, "").replace(/\\/g, "/");
}

export function walkTypeScriptFiles(rootPath: string): string[] {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(rootPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const fullPath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      return isIgnoredDir(entry.name) ? [] : walkTypeScriptFiles(fullPath);
    }

    return entry.isFile() && extname(entry.name) === ".ts" ? [fullPath] : [];
  });
}

function loadFileInput(rootDir: string, filePath: string): Result<FileInput> {
  try {
    const content = readFileSync(filePath, "utf8");
    return {
      ok: true,
      data: {
        path: toRelativePath(rootDir, filePath),
        content,
      },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao ler arquivo",
    };
  }
}

export function processWorkspaceFile(rootDir: string, filePath: string): ServiceProcessResult {
  const loaded = loadFileInput(rootDir, filePath);
  if (!loaded.ok) {
    return {
      filePath,
      result: { ok: false, error: loaded.error },
    };
  }

  return {
    filePath,
    result: processFile(loaded.data),
  };
}
