/**
 * Raiz do projeto (onde estão `package.json`, `dist/`, `server/`), derivada só de import.meta.url.
 * Opcional: PROJECT_ROOT absoluto com package.json (deploys fora do layout padrão).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
function inferRootFromModuleLocation() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const norm = here.replace(/\\/g, "/");
    // dist/server/_core (tsc rootDir ".") ou dist/_core (após flatten)
    const isBundledCoreNested = /\/dist\/server\/_core$/i.test(norm);
    const isBundledCoreFlat = /\/dist\/_core$/i.test(norm);
    if (isBundledCoreNested) {
        return path.resolve(here, "..", "..", "..");
    }
    if (isBundledCoreFlat) {
        return path.resolve(here, "..", "..");
    }
    return path.resolve(here, "..", "..");
}
export function getProjectRoot() {
    const envRoot = process.env.PROJECT_ROOT?.trim();
    if (envRoot && path.isAbsolute(envRoot)) {
        const marker = path.join(envRoot, "package.json");
        if (fs.existsSync(marker)) {
            return path.normalize(envRoot);
        }
        console.error(`[PROJECT_ROOT] PROJECT_ROOT ignorado (sem package.json em ${envRoot}). Usando detecção por import.meta.url.`);
    }
    const root = path.normalize(inferRootFromModuleLocation());
    const marker = path.join(root, "package.json");
    if (!fs.existsSync(marker)) {
        console.error(`[PROJECT_ROOT] Raiz inferida sem package.json: ${root}. Defina PROJECT_ROOT ou mantenha o layout dist/server/_core ou server/_core.`);
    }
    return root;
}
