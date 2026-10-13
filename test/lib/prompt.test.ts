import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { terminalPrompt } from '../../src/lib/prompt.ts';

function terminal(isTTY: boolean) {
  const input = Object.assign(new PassThrough(), { isTTY });
  const output = new PassThrough();
  let written = '';
  output.on('data', (chunk: Buffer) => (written += chunk.toString()));
  return { input, output, written: () => written };
}

describe('terminalPrompt', () => {
  it("is undefined without a terminal, so nothing waits for an answer that can't come", () => {
    const { input, output } = terminal(false);
    expect(terminalPrompt({ input, output })).toBeUndefined();
  });

  it('asks the question and returns the trimmed answer', async () => {
    const streams = terminal(true);
    const prompt = terminalPrompt(streams);
    const answer = prompt?.('Why? ');
    streams.input.write('  Because it helps  \n');
    await expect(answer).resolves.toBe('Because it helps');
    expect(streams.written()).toContain('Why? ');
  });

  it('defaults to the real terminal', () => {
    expect(terminalPrompt() === undefined).toBe(!process.stdin.isTTY);
  });
});
