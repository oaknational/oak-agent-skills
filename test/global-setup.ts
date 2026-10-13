import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// End-to-end tests run the built command, so build it once before any test runs.
export default function setup(): void {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], {
    cwd: root,
    stdio: 'inherit',
  });
}
