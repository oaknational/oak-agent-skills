import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCodeowners } from '../../../src/lib/validate/codeowners.ts';
import { makeTempDir, removeTree, writeTree } from '../../helpers/tree.ts';

let root: string;
beforeEach(() => {
  root = makeTempDir('codeowners');
});
afterEach(() => {
  removeTree(root);
});

const withCodeowners = (text: string) => {
  writeTree(root, { '.github/CODEOWNERS': text });
};

describe('checkCodeowners', () => {
  it('passes when every line lists the skills maintainers and every bundle has a line', () => {
    withCodeowners(
      [
        '# Comments and blank lines are ignored',
        '',
        '* @oaknational/skills-maintainers',
        '/skills/repos/owa/ @oaknational/owa-team @oaknational/skills-maintainers # trailing comment',
        'skills/repos/oc/ @oaknational/oc-team @oaknational/skills-maintainers',
      ].join('\n'),
    );
    expect(checkCodeowners(root, ['oc', 'owa'])).toEqual([]);
  });

  it('fails a line without the skills maintainers', () => {
    withCodeowners('* @oaknational/skills-maintainers\n/skills/central/ @oaknational/engineers\n');
    expect(checkCodeowners(root, [])).toEqual([
      {
        file: '.github/CODEOWNERS:2',
        message:
          "doesn't list @oaknational/skills-maintainers. Every line must, so the skills maintainers can review anything.",
      },
    ]);
  });

  it('fails a repository folder with no line, even when the catch-all covers it', () => {
    withCodeowners('* @oaknational/skills-maintainers\n');
    mkdirSync(join(root, 'skills/repos/ora'), { recursive: true });
    expect(checkCodeowners(root, ['ora'])).toEqual([
      {
        file: '.github/CODEOWNERS',
        message:
          "has no line for /skills/repos/ora/. Add one naming its repository's team and @oaknational/skills-maintainers.",
      },
    ]);
  });

  it('fails when CODEOWNERS is missing', () => {
    expect(checkCodeowners(root, [])).toEqual([
      { file: '.github/CODEOWNERS', message: 'is missing' },
    ]);
  });
});
