import { createInterface } from 'node:readline/promises';

export type Prompt = (question: string) => Promise<string>;

interface Streams {
  input: NodeJS.ReadableStream & { isTTY?: boolean };
  output: NodeJS.WritableStream;
}

// Asks on the terminal. Returns undefined when there's no terminal to ask on, such as in CI.
export function terminalPrompt(
  streams: Streams = { input: process.stdin, output: process.stderr },
): Prompt | undefined {
  if (streams.input.isTTY !== true) return undefined;
  return async (question) => {
    const readline = createInterface({ input: streams.input, output: streams.output });
    try {
      return (await readline.question(question)).trim();
    } finally {
      readline.close();
    }
  };
}
