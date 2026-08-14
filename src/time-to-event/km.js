// Pure Kaplan–Meier estimation for the time-to-event module (#128) — the normative
// implementation of design §3 (obot.roadmap requirements/design/161_design.html).
// No Chart.js, no DOM: observations in, estimate out. Everything the renderer shows —
// the step curve, the confidence band, the censor marks, and every number in the
// at-risk / cumulative-events table — comes from the single pass here, so the classic
// KM defect (a risk table that disagrees with its own curve) is structurally
// impossible rather than tested away.
//
// Conventions (all asserted in tests/unit/time-to-event/km.test.js and cross-validated
// against R survival::survfit in survfit.test.js):
// - At risk at time t means observed time ≥ t: at a tied time, events are processed
//   before censorings, so a participant censored at an event time is still in that
//   event's risk set (the survfit convention).
// - Variance is Greenwood's formula; the pointwise 95% interval uses the
//   complementary log-log transform (survfit conf.type = "log-log"), which keeps
//   bounds inside [0, 1] structurally.
// - Where the transform is undefined the bound is null, never extrapolated: before
//   the first event (S = 1), at S = 0, and from the point where a step consumes the
//   whole risk set (the Greenwood sum's 1/(n·(n−d)) term is infinite from there on).

/** z for a two-sided 95% interval. */
const Z95 = 1.959963984540054;

/**
 * @typedef {Object} KmPoint One product-limit step (a distinct event time).
 * @property {number} time The event time.
 * @property {number} atRisk Participants with observed time ≥ this time.
 * @property {number} events Events at exactly this time (dⱼ).
 * @property {number} censored Censorings at exactly this time (after the events).
 * @property {number} surv S(t) just after the step.
 * @property {number|null} se Greenwood standard error of S(t); null once undefined.
 * @property {number|null} lo Pointwise 95% lower bound (log-log); null where undefined.
 * @property {number|null} hi Pointwise 95% upper bound (log-log); null where undefined.
 * @property {string[]} ids Ids of the participants whose event is at this time.
 */

/**
 * Estimate the Kaplan–Meier survival function for one group.
 *
 * @param {Array<{time: number, event: boolean, id?: string}>} observations One entry
 *   per participant: positive time in days and whether it ends in the event (true)
 *   or censoring (false). Callers validate/exclude unusable rows before this point.
 * @returns {{
 *   points: KmPoint[],
 *   censorTimes: Array<{time: number, count: number, surv: number, ids: string[]}>,
 *   total: number,
 *   maxTime: number,
 *   riskTableAt: (times: number[]) => Array<{time: number, atRisk: number, cumEvents: number}>
 * }} The estimate; `riskTableAt` reads the same sorted arrays the estimator walked.
 */
export function kmEstimate(observations) {
  const sorted = [...observations].sort((a, b) => a.time - b.time);
  const times = sorted.map((o) => o.time);
  const total = sorted.length;
  const maxTime = total ? times[total - 1] : 0;

  // Group by distinct time, events before censorings.
  const byTime = new Map();
  for (const o of sorted) {
    if (!byTime.has(o.time)) byTime.set(o.time, { events: [], censored: [] });
    byTime.get(o.time)[o.event ? 'events' : 'censored'].push(o.id ?? '');
  }

  const points = [];
  const censorTimes = [];
  let atRisk = total;
  let surv = 1;
  let greenwoodSum = 0; // Σ dⱼ / (nⱼ (nⱼ − dⱼ)) over event times so far
  let greenwoodDefined = true;

  for (const [time, group] of byTime) {
    const d = group.events.length;
    if (d > 0) {
      surv *= 1 - d / atRisk;
      let se = null;
      let lo = null;
      let hi = null;
      if (atRisk - d === 0) greenwoodDefined = false;
      else greenwoodSum += d / (atRisk * (atRisk - d));
      if (greenwoodDefined && surv > 0 && surv < 1) {
        const varS = surv * surv * greenwoodSum;
        se = Math.sqrt(varS);
        // θ = log(−log S): Var[θ] = Var[S] / (S·log S)²; CI = S^exp(±z√Var[θ]).
        const sdTheta = Math.sqrt(varS) / Math.abs(surv * Math.log(surv));
        lo = Math.pow(surv, Math.exp(Z95 * sdTheta));
        hi = Math.pow(surv, Math.exp(-Z95 * sdTheta));
      }
      points.push({
        time,
        atRisk,
        events: d,
        censored: group.censored.length,
        surv,
        se,
        lo,
        hi,
        ids: group.events
      });
    }
    if (group.censored.length)
      censorTimes.push({ time, count: group.censored.length, surv, ids: group.censored });
    atRisk -= d + group.censored.length;
  }

  // Cumulative events over the walked event times, for the strip table.
  const eventTimes = points.map((p) => p.time);
  const cumEvents = [];
  let running = 0;
  for (const p of points) {
    running += p.events;
    cumEvents.push(running);
  }

  return {
    points,
    censorTimes,
    total,
    maxTime,
    riskTableAt(ticks) {
      return ticks.map((t) => {
        // At risk: observed time ≥ t over the presorted times array.
        let loIdx = 0;
        let hiIdx = times.length;
        while (loIdx < hiIdx) {
          const mid = (loIdx + hiIdx) >> 1;
          if (times[mid] < t) loIdx = mid + 1;
          else hiIdx = mid;
        }
        // Cumulative events: last event time ≤ t.
        let e = 0;
        for (let i = 0; i < eventTimes.length && eventTimes[i] <= t; i += 1) e = cumEvents[i];
        return { time: t, atRisk: times.length - loIdx, cumEvents: e };
      });
    }
  };
}
