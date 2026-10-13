// Regenerates the skills table in README.md from the skills and skills/profiles.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findCentralRoot } from '../src/lib/validate/central-repo.ts';
import { loadDevDependencies } from '../src/lib/validate/dev-dependencies.ts';
import {
  README_PATH,
  renderSkillsTable,
  replaceSkillsTable,
  TABLE_END,
  TABLE_START,
} from '../src/lib/validate/readme-table.ts';
import { validateRepository } from '../src/lib/validate/repository.ts';
import { compileSchemas } from '../src/lib/validate/schemas.ts';

const root = findCentralRoot(process.cwd());
const deps = await loadDevDependencies();
const { skills, profiles } = validateRepository(root, deps, compileSchemas(deps));
const file = join(root, README_PATH);
const updated = replaceSkillsTable(readFileSync(file, 'utf8'), renderSkillsTable(skills, profiles));
if (updated === undefined) {
  console.error(`README.md needs the ${TABLE_START} and ${TABLE_END} markers.`);
  process.exitCode = 1;
} else {
  writeFileSync(file, updated);
  console.log('Updated the skills table in README.md.');
}
