import tseslint from "typescript-eslint";

/**
 * ESLint backend (foco anti-regressão):
 * - `ban-ts-comment`: todo o server.
 * - `no-explicit-any`: caminhos críticos (LEO gateway, health, utils, action-engine).
 * - `no-restricted-imports`: `services/ai` não importa `db/index` nem `db/core` direto.
 *
 * Migração: ampliar a lista `files` do bloco `no-explicit-any` até cobrir `server/services/**`.
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "client/node_modules/**",
      "client/dist/**",
      "**/*.test.ts",
      "server/tests/**",
      "server/types/service-safe-example.ts",
      "client/src/_legacy/**",
    ],
  },
  {
    files: ["server/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "error",
    },
  },
  {
    files: [
      "server/utils/**/*.ts",
      "server/types/global.ts",
      "server/services/system-health.service.ts",
      "server/services/leo-erp-data.facade.ts",
      "server/services/leo/**/*.ts",
      "server/services/ai/action-engine.ts",
    ],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["server/services/ai/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "../../db/core",
              message:
                "LEO AI: use serviços de domínio (ex.: finance.service) ou `../leo-erp-data.facade` (ponte SQL legado); não importe `db/core`.",
            },
            {
              name: "../../db/index",
              message:
                "LEO AI: use serviços de domínio ou `../leo-erp-data.facade` (ponte SQL legado); não importe `db/index` diretamente.",
            },
          ],
        },
      ],
    },
  },
  // ── FRONTEND HARDENING ──
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // Tipagem forte - sem 'any' ou tipos implícitos
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-implicit-any-catch": "error",

      // Nulabilidade explícita
      "@typescript-eslint/strict-boolean-expressions": "warn",

      // Boas práticas TypeScript
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // Segurança
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Consistência de código
      "@typescript-eslint/explicit-function-return-types": [
        "warn",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
    },
  },
  // ── UTILS E TIPOS CRÍTICOS ──
  {
    files: ["client/src/utils/**/*.ts", "client/src/types/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-types": "error",
    },
  }
);
