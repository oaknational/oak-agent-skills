import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Tests create real git repositories, which is slower than pure unit tests.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The entry point only wires run() to the process. End-to-end tests run it
      // as a child process, which coverage can't see.
      exclude: ['src/cli.ts'],
      thresholds: {
        lines: 90,
        branches: 90,
      },
    },
  },
});
