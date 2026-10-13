import { existsSync, mkdirSync, readFileSync, readlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyLinks, linkPath, linkTarget, planLinks } from '../../src/lib/shims.ts';
import { makeTempDir, removeTree, writeTree } from '../helpers/tree.ts';

let root: string;
beforeEach(() => {
  root = makeTempDir('shims');
  writeTree(root, {
    '.agents/skills/oak-a/SKILL.md': 'a',
    '.agents/skills/oak-b/SKILL.md': 'b',
  });
});
afterEach(() => {
  removeTree(root);
});

function link(name: string, target = linkTarget(name)): void {
  mkdirSync(join(root, '.claude/skills'), { recursive: true });
  symlinkSync(target, join(root, linkPath(name)), 'dir');
}

describe('links', () => {
  it('point from .claude/skills/<name> to ../../.agents/skills/<name>', () => {
    expect(linkPath('oak-a')).toBe('.claude/skills/oak-a');
    expect(linkTarget('oak-a')).toBe('../../.agents/skills/oak-a');
  });
});

describe('planLinks and applyLinks', () => {
  it('creates missing links, which resolve to the synced skill', () => {
    const plan = planLinks(root, ['oak-a', 'oak-b'], []);
    expect(plan).toEqual({
      create: ['oak-a', 'oak-b'],
      replace: [],
      keep: [],
      remove: [],
      conflicts: [],
      unmanaged: [],
    });
    applyLinks(root, plan);
    expect(readlinkSync(join(root, '.claude/skills/oak-a'))).toBe('../../.agents/skills/oak-a');
    expect(readFileSync(join(root, '.claude/skills/oak-b/SKILL.md'), 'utf8')).toBe('b');
  });

  it('keeps links that are already right, even before any manifest records them', () => {
    link('oak-a');
    expect(planLinks(root, ['oak-a'], []).keep).toEqual(['oak-a']);
  });

  it('replaces a managed link that points somewhere else', () => {
    link('oak-a', '../../somewhere/else');
    const plan = planLinks(root, ['oak-a'], ['oak-a']);
    expect(plan.replace).toEqual(['oak-a']);
    applyLinks(root, plan);
    expect(readlinkSync(join(root, '.claude/skills/oak-a'))).toBe('../../.agents/skills/oak-a');
  });

  it('removes managed links for skills no longer in the set', () => {
    link('oak-a');
    link('oak-b');
    const plan = planLinks(root, ['oak-a'], ['oak-a', 'oak-b']);
    expect(plan).toMatchObject({ keep: ['oak-a'], remove: ['oak-b'] });
    applyLinks(root, plan);
    expect(existsSync(join(root, '.claude/skills/oak-b'))).toBe(false);
    expect(existsSync(join(root, '.agents/skills/oak-b/SKILL.md'))).toBe(true);
  });

  it('leaves an unmanaged folder alone and reports it', () => {
    writeTree(root, { '.claude/skills/my-own-skill/SKILL.md': 'mine' });
    const plan = planLinks(root, ['oak-a'], []);
    expect(plan.unmanaged).toEqual(['my-own-skill']);
    applyLinks(root, plan);
    expect(readFileSync(join(root, '.claude/skills/my-own-skill/SKILL.md'), 'utf8')).toBe('mine');
  });

  it('reports a conflict, and leaves it, when a wanted link is taken by a folder', () => {
    writeTree(root, { '.claude/skills/oak-a/SKILL.md': 'a local copy' });
    const plan = planLinks(root, ['oak-a'], []);
    expect(plan.conflicts).toEqual(['oak-a']);
    applyLinks(root, plan);
    expect(readFileSync(join(root, '.claude/skills/oak-a/SKILL.md'), 'utf8')).toBe('a local copy');
  });

  it('reports a conflict when a wanted link is an unmanaged link elsewhere', () => {
    link('oak-a', '../../somewhere/else');
    expect(planLinks(root, ['oak-a'], []).conflicts).toEqual(['oak-a']);
  });

  it('does not remove a previously managed name that is now a folder', () => {
    writeTree(root, { '.claude/skills/oak-b/SKILL.md': 'replaced by hand' });
    const plan = planLinks(root, [], ['oak-b']);
    expect(plan).toMatchObject({ remove: [], unmanaged: ['oak-b'] });
  });

  it('copes with no .claude/skills folder', () => {
    expect(planLinks(root, [], [])).toEqual({
      create: [],
      replace: [],
      keep: [],
      remove: [],
      conflicts: [],
      unmanaged: [],
    });
  });
});
