import { describe, expect, it } from 'vitest';
import { splitSkillFile } from '../../src/lib/skill-file.ts';

describe('splitSkillFile', () => {
  it('splits the frontmatter from the body and says where the body starts', () => {
    expect(splitSkillFile('---\nname: x\ndescription: y\n---\n\n# Body\n')).toEqual({
      frontmatter: 'name: x\ndescription: y',
      body: '\n# Body\n',
      bodyStartLine: 5,
    });
  });

  it('handles Windows line endings', () => {
    expect(splitSkillFile('---\r\nname: x\r\n---\r\nBody')?.frontmatter).toBe('name: x');
  });

  it.each([
    ['no opening line', '# Body\n'],
    ['no closing line', '---\nname: x\n# Body\n'],
    ['text before the opening line', '\n---\nname: x\n---\n'],
  ])('returns undefined with %s', (_label, text) => {
    expect(splitSkillFile(text)).toBeUndefined();
  });
});
