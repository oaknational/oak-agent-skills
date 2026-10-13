import type { Command } from './command.ts';
import { validate } from './validate.ts';

// Each command adds itself here as it's built.
export const commands: readonly Command[] = [validate];
