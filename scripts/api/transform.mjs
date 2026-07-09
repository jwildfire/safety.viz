// Doclet-JSON → API-page data model (#6, #21 design Pillar 3). Pure
// functions over `jsdoc -X` output and the data-contract JSON schema; the
// docs-site build (#7) renders the resulting model, so no API fact is ever
// hand-copied into a page.

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const typeNames = (type) => (type && type.names ? type.names.join(' | ') : null);

// Doclet default values arrive typed (true, 10, null, "'TEST'"); the tables
// render them as strings, with absent defaults staying null.
const displayDefault = (owner) => (has(owner, 'defaultvalue') ? String(owner.defaultvalue) : null);

const isDocumented = (doclet) => !doclet.undocumented && doclet.access !== 'private';

function transformParam(param) {
  return {
    name: param.name,
    type: typeNames(param.type),
    optional: Boolean(param.optional),
    default: displayDefault(param),
    description: param.description || ''
  };
}

function buildSignature(name, params) {
  const parts = params
    .filter((param) => param.name && !param.name.includes('.'))
    .map((param) => (param.optional ? `[${param.name}]` : param.name));
  return `${name}(${parts.join(', ')})`;
}

function transformFunction(doclet, name = doclet.name) {
  const params = (doclet.params || []).map(transformParam);
  const [firstReturn] = doclet.returns || [];
  return {
    name,
    signature: buildSignature(name, params),
    description: doclet.description || '',
    params,
    returns: firstReturn
      ? { type: typeNames(firstReturn.type), description: firstReturn.description || '' }
      : null
  };
}

function transformSetting(property) {
  return {
    name: property.name,
    type: typeNames(property.type),
    nullable: Boolean(property.nullable),
    default: displayDefault(property),
    description: property.description || ''
  };
}

/**
 * Reshape raw `jsdoc -X` doclets into the factory/methods/settings model.
 * Only documented, non-private instance methods of the module's classes make
 * the methods table; the settings table comes from the settings typedef's
 * properties; everything documented-but-thin or public-but-undocumented is
 * reported in `missing`.
 */
export function transformDoclets(doclets, { factoryName } = {}) {
  const missing = [];

  // The default export surfaces as a documented `module.exports` doclet plus
  // a spurious undocumented global twin — only the former counts.
  const factoryDoclet = doclets.find(
    (doclet) =>
      doclet.kind === 'function' && doclet.longname === 'module.exports' && isDocumented(doclet)
  );
  let factory = null;
  if (factoryDoclet) {
    const sourceName = factoryDoclet.meta?.filename?.replace(/\.[^.]+$/, '');
    factory = transformFunction(factoryDoclet, factoryName || sourceName || 'default');
  } else {
    missing.push({
      kind: 'factory',
      name: factoryName || 'default export',
      reason: 'no documented default-export factory'
    });
  }

  const classNames = new Set(
    doclets.filter((doclet) => doclet.kind === 'class').map((doclet) => doclet.name)
  );
  const instanceMethods = doclets.filter(
    (doclet) =>
      doclet.kind === 'function' && doclet.scope === 'instance' && classNames.has(doclet.memberof)
  );
  // jsdoc can emit documented and undocumented doclets for one longname;
  // judge each method by its best doclet.
  const methods = [];
  const seen = new Set();
  for (const doclet of instanceMethods) {
    if (seen.has(doclet.longname)) continue;
    seen.add(doclet.longname);
    const group = instanceMethods.filter((other) => other.longname === doclet.longname);
    const documented = group.find(isDocumented);
    if (documented && documented.description) {
      methods.push(transformFunction(documented));
    } else if (!group.some((other) => other.access === 'private')) {
      missing.push({ kind: 'method', name: doclet.name, reason: 'undocumented public method' });
    }
  }

  const typedef = doclets.find(
    (doclet) => doclet.kind === 'typedef' && Array.isArray(doclet.properties)
  );
  const settings = (typedef ? typedef.properties : []).map(transformSetting);
  for (const setting of settings) {
    if (!setting.description) {
      missing.push({ kind: 'setting', name: setting.name, reason: 'missing description' });
    }
    if (!setting.type) {
      missing.push({ kind: 'setting', name: setting.name, reason: 'missing type' });
    }
  }

  return { factory, methods, settings, missing };
}

/**
 * Derive the data-contract model from the histogram JSON schema: one row per
 * (possibly nested) property, with required flags from each level's
 * `required` array and local `$defs` references resolved to their type.
 */
export function transformSchema(schema) {
  const fields = [];

  const resolve = (node) => {
    if (!node || !node.$ref || !node.$ref.startsWith('#/')) return node;
    const target = node.$ref
      .slice(2)
      .split('/')
      .reduce((parent, part) => (parent ? parent[part] : undefined), schema);
    const { $ref, ...local } = node;
    return { ...target, ...local };
  };

  const walk = (properties, required, prefix) => {
    for (const [key, rawNode] of Object.entries(properties || {})) {
      const node = resolve(rawNode);
      const name = prefix ? `${prefix}.${key}` : key;
      fields.push({
        name,
        type: node.type || null,
        required: required.includes(key),
        default: has(node, 'default') ? node.default : null,
        description: node.description || ''
      });
      if (node.properties) walk(node.properties, node.required || [], name);
    }
  };

  walk(schema.properties, schema.required || [], '');
  return { title: schema.title || '', description: schema.description || '', fields };
}

/**
 * Assemble the full API data artifact for one module. `settingsKeys`
 * (normally Object.keys(DEFAULT_SETTINGS)) closes the loop between code and
 * docs: any key missing from the settings typedef is reported in `missing`.
 */
export function buildApiModel({ doclets, schema, module, settingsKeys = [], factoryName }) {
  const { factory, methods, settings, missing } = transformDoclets(doclets, {
    factoryName: factoryName || module
  });
  const documentedNames = new Set(settings.map((setting) => setting.name));
  for (const key of settingsKeys) {
    if (!documentedNames.has(key)) {
      missing.push({
        kind: 'setting',
        name: key,
        reason: 'not documented in the settings typedef'
      });
    }
  }
  return { module, factory, methods, settings, dataContract: transformSchema(schema), missing };
}
