import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'server/tests/**/*.test.ts',
      'server/services/**/*.test.ts',
      'tests/single-boot-guard.spec.ts',
      'tests/client/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      'build',
      'client',
    ],
    environment: 'node',
  },
})
