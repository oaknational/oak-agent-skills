import { check } from './check.ts';
import type { Command } from './command.ts';
import { status } from './status.ts';
import { sync } from './sync.ts';
import { validate } from './validate.ts';

// Each command adds itself here as it's built.
export const commands: readonly Command[] = [sync, status, check, validate];
