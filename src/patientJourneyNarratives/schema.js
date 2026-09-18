// A small JSON-Schema checker for the narrative runtime (#146): the subset
// the skill schemas use (type, const, enum, properties, required,
// additionalProperties, items, min/maxItems, min/maxLength, minimum,
// maximum, pattern, and `$ref` into the same document's `definitions`).
// The library has one runtime dependency (Chart.js) and this runs inside the
// browser bundle, so a full validator is not worth its weight; the skill
// schemas are written to this subset and schema.test.js pins it.

const typeOf = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
};

const matchesType = (value, type) => {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  return actual === type;
};

function resolveRef(ref, root) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    throw new Error(`schema: unsupported $ref "${ref}"`);
  }
  let node = root;
  for (const part of ref.slice(2).split('/')) {
    node = node && node[part];
    if (node === undefined) throw new Error(`schema: $ref "${ref}" does not resolve`);
  }
  return node;
}

function check(value, schema, root, path, errors) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.$ref) {
    check(value, resolveRef(schema.$ref, root), root, path, errors);
    return;
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((type) => matchesType(value, type))) {
      errors.push(`${path}: expected ${types.join(' | ')}, got ${typeOf(value)}`);
      return;
    }
  }
  if ('const' in schema && value !== schema.const) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: longer than ${schema.maxLength} characters`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match ${schema.pattern}`);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: above maximum ${schema.maximum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: fewer than ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: more than ${schema.maxItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => check(item, schema.items, root, `${path}[${index}]`, errors));
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${path}: missing required "${key}"`);
    }
    const properties = schema.properties || {};
    for (const [key, sub] of Object.entries(properties)) {
      if (key in value) check(value[key], sub, root, `${path}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
  }
}

/**
 * Validate a value against a schema node inside a schema document.
 * @param {*} value The value to check.
 * @param {Object} schema The schema node (may `$ref` into `root.definitions`).
 * @param {Object} [root=schema] The document the node's `$ref`s resolve against.
 * @returns {{ok: boolean, errors: string[]}} The verdict and every violation found, paths rooted at `$`.
 */
export function validateSchema(value, schema, root = schema) {
  const errors = [];
  check(value, schema, root, '$', errors);
  return { ok: errors.length === 0, errors };
}

/**
 * The `maxItems` of a schema document's `Draft.sentences`, or null.
 * @param {Object} root A skill schema document.
 * @returns {?number} The sentence cap.
 */
export function sentenceCap(root) {
  const cap = root?.definitions?.Draft?.properties?.sentences?.maxItems;
  return Number.isInteger(cap) ? cap : null;
}

/**
 * A copy of a schema node with every `$ref` into the document inlined, so
 * the node can travel alone as a tool's `input_schema`.
 * @param {Object} schema The node.
 * @param {Object} root The document its `$ref`s resolve against.
 * @returns {Object} The self-contained copy.
 */
export function inlineRefs(schema, root) {
  const walk = (node, depth) => {
    if (depth > 32) throw new Error('schema: $ref nesting too deep');
    if (Array.isArray(node)) return node.map((entry) => walk(entry, depth + 1));
    if (!node || typeof node !== 'object') return node;
    if (node.$ref) return walk(resolveRef(node.$ref, root), depth + 1);
    const out = {};
    for (const [key, value] of Object.entries(node)) out[key] = walk(value, depth + 1);
    return out;
  };
  return walk(schema, 0);
}
