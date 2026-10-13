import type { Catalogue } from './catalogue.ts';
import { OakSkillsError } from './errors.ts';
import { ExitCode } from './exit-codes.ts';

// The oakSkills settings in a consuming repository's root package.json.
export interface OakSkillsConfig {
  profiles: string[];
  bundle: string | undefined;
  include: string[];
  exclude: string[];
}

export interface ResolvedSkill {
  name: string;
  // The skill's folder inside the package, which is also its path in the central repository.
  source: string;
}

export interface Resolution {
  skills: ResolvedSkill[];
  warnings: string[];
}

function configError(problems: string[]): OakSkillsError {
  return new OakSkillsError(
    problems.length === 1
      ? `oakSkills in package.json: ${problems[0] ?? ''}`
      : `oakSkills in package.json has ${String(problems.length)} problems:\n${problems.map((p) => `- ${p}`).join('\n')}`,
    { exitCode: ExitCode.Configuration },
  );
}

function stringList(value: unknown, field: string, problems: string[]): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  problems.push(`${field} must be a list of names`);
  return [];
}

export function readOakSkillsConfig(packageJson: Record<string, unknown>): OakSkillsConfig {
  const raw = packageJson.oakSkills;
  if (raw === undefined) {
    throw new OakSkillsError('package.json has no oakSkills settings.', {
      exitCode: ExitCode.Configuration,
      hint: 'Run "oak-skills init" to add them.',
    });
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw configError(['must be an object']);
  }
  const problems: string[] = [];
  const { profiles, bundle, include, exclude, ...rest } = raw as Record<string, unknown>;
  for (const key of Object.keys(rest)) problems.push(`"${key}" isn't a setting oak-skills knows`);
  if (bundle !== undefined && bundle !== null && typeof bundle !== 'string') {
    problems.push('bundle must be a repository code, such as "owa"');
  }
  const config: OakSkillsConfig = {
    profiles: stringList(profiles, 'profiles', problems),
    bundle: typeof bundle === 'string' ? bundle : undefined,
    include: stringList(include, 'include', problems),
    exclude: stringList(exclude, 'exclude', problems),
  };
  if (problems.length > 0) throw configError(problems);
  return config;
}

const quote = (names: Iterable<string>) => [...names].map((name) => `"${name}"`).join(', ');

// The skills a repository receives: its profiles, plus include, minus exclude, plus its whole bundle.
export function resolveSkills(config: OakSkillsConfig, catalogue: Catalogue): Resolution {
  const problems: string[] = [];
  const warnings: string[] = [];
  const subscribed = new Set<string>();

  for (const profile of config.profiles) {
    const skills = catalogue.profiles.get(profile);
    if (skills === undefined) {
      problems.push(
        `unknown profile "${profile}". The profiles are ${quote(catalogue.profiles.keys())}.`,
      );
    } else {
      for (const skill of skills) subscribed.add(skill);
    }
  }
  for (const skill of config.include) {
    if (!catalogue.shared.has(skill)) {
      problems.push(`include lists "${skill}", which isn't a shared skill in this version`);
    } else if (config.exclude.includes(skill)) {
      problems.push(`"${skill}" is in both include and exclude`);
    }
  }
  for (const skill of config.exclude) {
    if (!catalogue.shared.has(skill)) {
      problems.push(`exclude lists "${skill}", which isn't a shared skill in this version`);
    } else if (!subscribed.has(skill) && !config.include.includes(skill)) {
      warnings.push(
        `exclude lists "${skill}", but none of your profiles includes it, so it has no effect.`,
      );
    }
  }
  const bundleSkills = config.bundle === undefined ? [] : catalogue.bundles.get(config.bundle);
  if (bundleSkills === undefined) {
    const known = [...catalogue.bundles.keys()];
    problems.push(
      `unknown bundle "${String(config.bundle)}". ${known.length === 0 ? 'This version has no bundles.' : `The bundles are ${quote(known)}.`}`,
    );
  }
  if (problems.length > 0) throw configError(problems);

  for (const skill of config.include) subscribed.add(skill);
  for (const skill of config.exclude) subscribed.delete(skill);
  const skills: ResolvedSkill[] = [
    ...[...subscribed].map((name) => ({ name, source: `skills/central/${name}` })),
    ...(bundleSkills ?? []).map((name) => ({
      name,
      source: `skills/repos/${String(config.bundle)}/${name}`,
    })),
  ].sort((a, b) => (a.name < b.name ? -1 : 1));
  return { skills, warnings };
}
