import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
export const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
export const builtCli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
