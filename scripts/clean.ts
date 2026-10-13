import { rmSync } from 'node:fs';

// tsc never deletes output, so a source file that was removed would otherwise still ship from dist/.
rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
