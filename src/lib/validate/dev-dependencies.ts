import type { Ajv2020 } from 'ajv/dist/2020.js';
import type * as Yaml from 'yaml';
import { OakSkillsError } from '../errors.ts';

export interface DevDependencies {
  Ajv: typeof Ajv2020;
  yaml: typeof Yaml;
}

export type Importer = (specifier: string) => Promise<unknown>;

const importModule: Importer = (specifier) => import(specifier);

// validate needs a YAML parser and a JSON Schema validator, but the package ships with no runtime
// dependencies. Both come from this repository's dev dependencies, so validate only runs here.
export async function loadDevDependencies(
  importer: Importer = importModule,
): Promise<DevDependencies> {
  try {
    const [ajvModule, yaml] = await Promise.all([importer('ajv/dist/2020.js'), importer('yaml')]);
    return { Ajv: (ajvModule as { Ajv2020: typeof Ajv2020 }).Ajv2020, yaml: yaml as typeof Yaml };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      throw new OakSkillsError(
        'oak-skills validate only runs in the central oak-agent-skills repository.',
        {
          hint: 'It needs that repository\'s dev dependencies. Consuming repositories run "oak-skills check" instead.',
        },
      );
    }
    throw error;
  }
}
