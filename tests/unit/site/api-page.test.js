import { describe, it, expect } from 'vitest';
import { renderApiPage } from '../../../scripts/site-lib.mjs';

// API-page generator (#7): renders the _api/<module>.json artifact (built by
// scripts/api/build-api-data.mjs, #6) — factory, lifecycle methods, settings,
// and the schema-derived data contract.

const model = {
  module: 'histogram',
  factory: {
    name: 'histogram',
    signature: 'histogram([element], [settings])',
    description: 'Create a safety histogram inside a container element.',
    params: [
      {
        name: 'element',
        type: 'string | HTMLElement',
        optional: true,
        default: "'body'",
        description: 'Container node, or a CSS selector for it.'
      }
    ],
    returns: { type: 'SafetyHistogram', description: 'The chart instance.' }
  },
  methods: [
    {
      name: 'init',
      signature: 'init(data)',
      description: 'Load data and render.',
      params: [
        {
          name: 'data',
          type: 'Array.<Object>',
          optional: false,
          default: null,
          description: 'Long-format result records.'
        }
      ],
      returns: { type: 'SafetyHistogram', description: 'The instance, for chaining.' }
    }
  ],
  settings: [
    {
      name: 'measure_col',
      type: 'string',
      nullable: false,
      default: "'TEST'",
      description: 'Column holding the measure name.'
    }
  ],
  dataContract: {
    title: 'Histogram data contract',
    description: 'Long-format result records.',
    fields: [
      {
        name: 'data',
        type: 'array',
        required: true,
        default: null,
        description: 'd3.csv()-style records.'
      }
    ]
  },
  missing: []
};

describe('site generator: API page', () => {
  const html = renderApiPage(model);

  it('renders the factory signature and parameters (#7)', () => {
    expect(html).toContain('histogram([element], [settings])');
    expect(html).toContain('string | HTMLElement');
  });

  it('renders each lifecycle method with signature, params, and returns (#7)', () => {
    expect(html).toContain('init(data)');
    expect(html).toContain('Array.&lt;Object&gt;');
    expect(html).toContain('The instance, for chaining.');
  });

  it('renders the settings table with type, default, and description (#7)', () => {
    expect(html).toContain('measure_col');
    expect(html).toContain('&#39;TEST&#39;');
    expect(html).toContain('Column holding the measure name.');
  });

  it('renders the schema-derived data contract (#7)', () => {
    expect(html).toContain('Histogram data contract');
    expect(html).toContain('d3.csv()-style records.');
  });
});
