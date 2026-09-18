// Bind a generator to a live Patient Journey Explorer instance (#146,
// design §8): builds the generator over the instance's own data (through
// the instance's live structured record, so the tools see the filters and
// lanes the panel does) and installs the five `narratives` slot functions
// with setSettings. No DOM here: the renderer owns the cards; this file only
// turns `(subject, …)` slot calls into `generator.run(slug, inputs)`.

import { create } from './index.js';
import { createDataService } from './dataService.js';

/**
 * Bind narrative generation to an explorer instance.
 * @param {Object} instance A live patientJourneyExplorer instance (needs `domains`, `settings`, `structured`, `subject`, `setSettings`).
 * @param {Object} [options] create() options (provider, apiKey, getToken, model, adapter, cache, …); `dataService` is built here.
 * @returns {Object} The generator, with `unbind()` added (restores empty slots).
 */
export function bindNarratives(instance, options = {}) {
  if (!instance || typeof instance.setSettings !== 'function') {
    throw new Error('bindNarratives: an explorer instance with setSettings() is required');
  }
  const service = () =>
    createDataService({
      domains: instance.domains || {},
      settings: instance.settings,
      structured: (subject) =>
        instance.structured && instance.structured.subject === subject ? instance.structured : null
    });
  // A fresh service per run: the instance's record is rebuilt on every
  // render, and a memoized copy would go stale under it.
  const generator = create({
    ...options,
    dataService: {
      structuredFor: (subject) => service().structuredFor(subject),
      subjects: () => service().subjects(),
      get settings() {
        return instance.settings;
      },
      get domains() {
        return instance.domains || {};
      },
      invalidate() {}
    }
  });
  const slots = {
    subjectSummary: (subject) => generator.run('subject-summary', { subject }),
    eventContext: (subject, anchorRowId, { windowDays } = {}) =>
      generator.run('event-context', {
        subject,
        anchor_row_id: anchorRowId,
        ...(Number.isFinite(windowDays) ? { window_days: windowDays } : {})
      }),
    labTrajectory: (subject, test) => generator.run('lab-trajectory', { subject, test }),
    doseJourney: (subject) => generator.run('dose-journey', { subject }),
    disposition: (subject) => generator.run('disposition', { subject })
  };
  instance.setSettings({ narratives: slots });
  generator.unbind = () => instance.setSettings({ narratives: null });
  generator.slots = slots;
  return generator;
}
