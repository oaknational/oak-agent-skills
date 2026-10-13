import { readFileSync } from 'node:fs';
import type { ErrorObject } from 'ajv/dist/2020.js';
import type { DevDependencies } from './dev-dependencies.ts';

// The schemas live in the central repository's schema/ folder, three levels up from here
// in both src/lib/validate and dist/lib/validate.
const schemaDir = new URL('../../../schema/', import.meta.url);

export type SchemaName = 'frontmatter' | 'profiles' | 'manifest';

export interface SchemaProblem {
  path: string;
  message: string;
}

export type SchemaValidator = (data: unknown) => SchemaProblem[];

export function readSchema(name: SchemaName, dir: URL = schemaDir): object {
  return JSON.parse(readFileSync(new URL(`${name}.schema.json`, dir), 'utf8')) as object;
}

function describe(error: ErrorObject): string {
  if (error.keyword === 'additionalProperties') {
    return `has a field that isn't allowed: ${String(error.params.additionalProperty)}`;
  }
  const description = (error.parentSchema as { description?: string } | undefined)?.description;
  if (error.keyword === 'pattern' && description !== undefined) {
    return `is ${JSON.stringify(error.data)}, which isn't allowed. ${description}`;
  }
  // ajv always sets a message, because its messages option is on by default.
  return String(error.message);
}

export function compileSchemas(
  { Ajv }: Pick<DevDependencies, 'Ajv'>,
  dir: URL = schemaDir,
): Record<SchemaName, SchemaValidator> {
  // verbose keeps each failing value and its schema, so messages can quote the schema's description.
  const ajv = new Ajv({ allErrors: true, strict: true, verbose: true });
  const compile = (name: SchemaName): SchemaValidator => {
    const validate = ajv.compile(readSchema(name, dir));
    return (data) => {
      if (validate(data)) return [];
      // ajv sets errors whenever validation fails.
      return (validate.errors as ErrorObject[]).map((error) => ({
        path: error.instancePath === '' ? '(top level)' : error.instancePath,
        message: describe(error),
      }));
    };
  };
  return {
    frontmatter: compile('frontmatter'),
    profiles: compile('profiles'),
    manifest: compile('manifest'),
  };
}
