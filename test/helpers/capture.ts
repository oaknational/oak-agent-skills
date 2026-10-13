import type { Output } from '../../src/commands/command.ts';

export interface Captured {
  output: Output;
  out: () => string;
  err: () => string;
}

export function capture(): Captured {
  const out: string[] = [];
  const err: string[] = [];
  return {
    output: { out: (text) => out.push(text), err: (text) => err.push(text) },
    out: () => out.join('\n'),
    err: () => err.join('\n'),
  };
}
