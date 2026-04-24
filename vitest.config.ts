import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'build',
      'client',
    ],
    environment: 'node',
  },
})
