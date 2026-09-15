/**
 * A small JSON Schema validator covering the subset of draft 2020-12 used by
 * spec/conformance.schema.json: type, properties, required,
 * additionalProperties, items, minItems, enum, const, pattern, allOf,
 * if/then/else, not, and local $ref. Kept dependency-free on purpose.
 */

export type Schema = boolean | { [keyword: string]: unknown };

export interface SchemaError {
  path: string;
  message: string;
}

export function validate(schema: Schema, value: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  check(schema, value, "$", schema, errors);
  return errors;
}

function check(schema: Schema, value: unknown, path: string, root: Schema, errors: SchemaError[]): void {
  if (schema === true) return;
  if (schema === false) {
    errors.push({ path, message: "schema forbids any value here" });
    return;
  }

  if (typeof schema.$ref === "string") {
    check(resolveRef(schema.$ref, root), value, path, root, errors);
  }

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!allowed.some((t) => matchesType(t, value))) {
      errors.push({ path, message: `expected ${allowed.join(" | ")}, got ${describe(value)}` });
      return;
    }
  }

  if (schema.const !== undefined && !sameJson(schema.const, value)) {
    errors.push({ path, message: `expected the constant ${JSON.stringify(schema.const)}` });
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((e) => sameJson(e, value))) {
    errors.push({ path, message: `expected one of ${JSON.stringify(schema.enum)}` });
  }

  if (typeof schema.pattern === "string" && typeof value === "string") {
    if (!new RegExp(schema.pattern, "u").test(value)) {
      errors.push({ path, message: `"${value}" does not match /${schema.pattern}/` });
    }
  }

  if (isObject(value)) {
    const props = isObject(schema.properties) ? (schema.properties as Record<string, Schema>) : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!Object.hasOwn(value, key)) errors.push({ path, message: `missing required property "${key}"` });
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (Object.hasOwn(value, key)) check(sub, value[key], `${path}.${key}`, root, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(props, key)) errors.push({ path: `${path}.${key}`, message: "unexpected property" });
      }
    } else if (isObject(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(props, key))
          check(schema.additionalProperties as Schema, value[key], `${path}.${key}`, root, errors);
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push({ path, message: `expected at least ${schema.minItems} item(s), got ${value.length}` });
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => {
        check(schema.items as Schema, item, `${path}[${i}]`, root, errors);
      });
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf as Schema[]) check(sub, value, path, root, errors);
  }

  if (schema.not !== undefined) {
    if (check_silent(schema.not as Schema, value, root)) {
      errors.push({ path, message: "matches a schema it must not match" });
    }
  }

  if (schema.if !== undefined) {
    const holds = check_silent(schema.if as Schema, value, root);
    if (holds && schema.then !== undefined) check(schema.then as Schema, value, path, root, errors);
    if (!holds && schema.else !== undefined) check(schema.else as Schema, value, path, root, errors);
  }
}

function check_silent(schema: Schema, value: unknown, root: Schema): boolean {
  const scratch: SchemaError[] = [];
  check(schema, value, "$", root, scratch);
  return scratch.length === 0;
}

function resolveRef(ref: string, root: Schema): Schema {
  if (!ref.startsWith("#/")) throw new Error(`only local $ref is supported, got ${ref}`);
  let node: unknown = root;
  for (const rawSegment of ref.slice(2).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isObject(node) || !Object.hasOwn(node, segment)) throw new Error(`unresolvable $ref ${ref}`);
    node = node[segment];
  }
  return node as Schema;
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject(value);
    default:
      throw new Error(`unsupported type keyword "${type}"`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
