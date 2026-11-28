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

  it('APP-STUDY-013: the data sources page names both served copies of gsm.reporting’s Results.yaml, each of which carries the one changed line and records it; and it gives DDF-RA’s MIT notice whole, with CDISC’s copyright line, beside the CC-BY-4.0 attribution (#427)', () => {
    const copies = ['site/vendor/gsm.reporting', 'site/vendor/study.builder/vendor/gsm.reporting'];
    const changed = '    name: FilterByLatestSnapshotDate';
    for (const copy of copies) {
      const file = `${copy}/workflow/3_reporting/Results.yaml`;
      // The page names the copy, and the copy is as the page says.
      expect(flat, file).toContain(`\`${file}\``);
      expect(read(file).split('\n')).toContain(changed);
      expect(read(file)).not.toContain('gsm.kri::FilterByLatestSnapshotDate');
      const record = JSON.parse(read(`${copy}/SOURCE.json`));
      const entry = record.files.find((one) => one.file === 'workflow/3_reporting/Results.yaml');
      // The one changed line is recorded in each. study.builder's copy also
      // records the notice of change it carries at its top (#428).
      expect(entry.patches[0], copy).toEqual(
        expect.objectContaining({
          original: '    name: gsm.kri::FilterByLatestSnapshotDate',
          replacement: changed
        })
      );
      const noticed = read(file).startsWith('# NOTICE OF CHANGE');
      expect(entry.patches.length, copy).toBe(noticed ? 2 : 1);
      expect(noticed, copy).toBe(copy.includes('study.builder'));
    }
    expect(flat).toContain('The changed file is served in two copies');
    expect(flat).toContain("study.builder's copy also carries a notice of change at its top");
    // DDF-RA's LICENSE file, as read at the commit the page names: the MIT
    // notice, with the copyright line as it stands there.
    const notice = page.match(/```text\n([\s\S]*?)\n\s*```/);
    expect(notice).not.toBeNull();
    const lines = notice[1].split('\n').map((line) => line.replace(/^ {2}/, ''));
    expect(lines.slice(0, 3)).toEqual(['MIT License', '', 'Copyright (c) 2022 CDISC']);
    expect(lines.join(' ').replace(/\s+/g, ' ')).toBe(
      'MIT License Copyright (c) 2022 CDISC ' +
        'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: ' +
        'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. ' +
        'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.'
    );
    // It stands with the attribution, in the protocols' section, and says why it is there.
    const section = page.slice(page.indexOf('### The five example protocols'));
    expect(section.indexOf('Content based on DDF-RA (GitHub)')).toBeGreaterThan(-1);
    expect(section.indexOf('MIT License')).toBeGreaterThan(
      section.indexOf('Content based on DDF-RA (GitHub)')
    );
    expect(section.indexOf('MIT License')).toBeLessThan(
      section.indexOf('## License and attribution')
    );
    expect(flat).toContain(
      'in case the example study definitions count as code and not as content'
    );
  });
});
