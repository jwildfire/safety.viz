import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// docs/DATA_SOURCES.md on the studies and protocols that come with
// study.builder (#424): the page has an entry for every ready-made simulated
// study and every example protocol the copy holds, and says whose they are and
// under what licence. The copy itself is held to its record elsewhere
// (`npm run study-builder:check`); this holds the page to the copy.

const at = (file) => fileURLToPath(new URL(`../../../${file}`, import.meta.url));
const read = (file) => readFileSync(at(file), 'utf8');
const COPY = 'site/vendor/study.builder';
const page = read('docs/DATA_SOURCES.md');
// The page wraps its lines; a sentence is looked for with its breaks taken out.
const flat = page.replace(/\s+/g, ' ');
const ATTRIBUTION =
  'Content based on DDF-RA (GitHub), https://github.com/cdisc-org/DDF-RA, used under the CC-BY-4.0 licence.';

describe('the data sources page, on what comes with study.builder', () => {
  it('APP-STUDY-004: the data sources page names every ready-made simulated study in the copy of study.builder by its name and its file, says each is synthetic and made with a modified copy of gsm.datasim, and names the protocol one of them followed (#424)', () => {
    const { presets } = JSON.parse(read(`${COPY}/presets/index.json`));
    const hosted = presets.filter((preset) => preset.study);
    expect(hosted.map((preset) => preset.settings.name)).toEqual([
      'READY-P1',
      'READY-P2',
      'PILOT-PROTOCOL'
    ]);
    for (const preset of hosted) {
      const row = page.split('\n').find((line) => line.startsWith(`| ${preset.settings.name} `));
      expect(row, preset.settings.name).toBeTruthy();
      expect(row).toContain(`\`presets/${preset.study}\``);
      expect(existsSync(at(`${COPY}/presets/${preset.study}`))).toBe(true);
      // What the study was asked for is what its settings say.
      const { participants, sites, months, seed } = preset.settings;
      expect(row).toContain(`${participants} participants at ${sites} sites over ${months} months`);
      expect(row).toContain(`seed ${seed}`);
      expect(row.includes('every monthly snapshot kept')).toBe(preset.settings.snapshots === 'all');
      // Only a study that followed a protocol names one.
      expect(row.includes('protocols/')).toBe(Boolean(preset.settings.protocol));
    }
    expect(flat).toContain(
      'Every row is synthetic: no real participant or site is in any of them.'
    );
    expect(flat).toContain('with a modified copy of gsm.datasim 2.1.0');
    expect(existsSync(at(`${COPY}/vendor/gsm.datasim/DESCRIPTION`))).toBe(true);
  });

  it('APP-STUDY-005: the data sources page names every example protocol in the copy of study.builder, CDISC’s DDF-RA as where each was read from, the CC-BY-4.0 licence, CDISC’s attribution sentence and that the protocols are changed from CDISC’s files; where a protocol file carries its own attribution and notice of change, the page’s words are those, character for character (#424)', () => {
    const files = readdirSync(at(`${COPY}/protocols`)).filter((file) =>
      file.endsWith('.protocol.json')
    );
    expect(files).toHaveLength(5);
    for (const file of files) {
      const row = page.split('\n').find((line) => line.startsWith(`| \`protocols/${file}\` `));
      expect(row, file).toBeTruthy();
      const protocol = JSON.parse(read(`${COPY}/protocols/${file}`));
      // The study is named as the file names it.
      expect(row).toContain(protocol.name);
      // CDISC's file: the page gives its path, which ends in the name the protocol says it was read from.
      const readFrom = protocol.source.file.split(' · ').pop();
      expect(row).toContain(`/${readFrom}\``);
      // From study.builder v0.5.1 each file carries these itself.
      for (const field of ['path', 'commit', 'attribution', 'changes']) {
        if (protocol.source[field])
          expect(flat, `${file}: ${field}`).toContain(protocol.source[field]);
      }
      if (protocol.source.license_url) expect(flat).toContain(protocol.source.license_url);
      expect(protocol.source.license).toMatch(/^CC-BY-4\.0/);
    }
    expect(flat).toContain('https://github.com/cdisc-org/DDF-RA');
    expect(flat).toContain(
      'Licence: **CC-BY-4.0** (<https://creativecommons.org/licenses/by/4.0/>)'
    );
    // The attribution is given twice: with the protocols, and in the licence section.
    expect(flat.split(ATTRIBUTION).length - 1).toBe(2);
    expect(flat).toContain("They are changed from CDISC's files, as each protocol file says");
  });

  it('APP-STUDY-006: the data sources page states safety.viz’s own licence as the repository does, and lists study.builder and the modified copy of gsm.datasim among the copied code (#424)', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.license).toBe('Apache-2.0');
    expect(read('LICENSE')).toContain('Apache License');
    expect(flat).toContain("safety.viz's own licence is Apache-2.0");
    expect(flat).not.toContain('states no licence of its own');
    const record = JSON.parse(read(`${COPY}/SOURCE.json`));
    const row = page.split('\n').find((line) => line.startsWith('| [study.builder]'));
    expect(row).toContain(`| ${record.license} `);
    expect(
      page.split('\n').some((line) => line.startsWith('| A modified copy of [gsm.datasim]'))
    ).toBe(true);
  });
});
