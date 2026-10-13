import { readPackageInfo } from './lib/package-info.ts';

export interface Output {
  out: (text: string) => void;
  err: (text: string) => void;
}

const usage = `Usage: oak-skills [--version] [--help]`;

export function run(args: readonly string[], output: Output): number {
  const [first] = args;
  if (first === '--version' || first === '-v') {
    output.out(readPackageInfo().version);
    return 0;
  }
  if (first === undefined || first === '--help' || first === '-h') {
    output.out(usage);
    return 0;
  }
  output.err(`Unknown command: ${first}\n${usage}`);
  return 1;
}
