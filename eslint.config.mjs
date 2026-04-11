import tseslint from "typescript-eslint";

/**
 * ESLint backend (foco anti-regressao):
 * - ban-ts-comment no server.
 * - no-explicit-any em caminhos criticos.
 * - no-restricted-imports para services/ai sem acesso direto a db.
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
      "no-console": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": "error",
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
                "LEO AI: use servicos de dominio (ex.: finance.service) ou ../leo-erp-data.facade; nao importe db/core.",
            },
            {
              name: "../../db/index",
              message:
                "LEO AI: use servicos de dominio ou ../leo-erp-data.facade; nao importe db/index diretamente.",
            },
          ],
        },
      ],
    },
  },
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
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["client/src/utils/**/*.ts", "client/src/types/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  }
);
