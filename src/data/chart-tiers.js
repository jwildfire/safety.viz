// Written by scripts/tiers.mjs from site/config.json: the charts that stand
// below Exploratory on the status ladder, as their own label reads them.
// Do not edit: set a rung in site/config.json and run `npm run tiers`.
export default {
  'hep-waterfall': {
    tier: 'experimental',
    title: 'Hepatic ALT Waterfall',
    note: 'Experimental: a new chart, drawn from a 2025 paper; its layout and settings may still change.'
  },
  'participant-profile': {
    tier: 'experimental',
    title: 'Participant Profile',
    note: 'Experimental: what it lists for a participant, and how, may still change.'
  },
  'nep-explorer': {
    tier: 'experimental',
    title: 'Nephrotoxicity Explorer',
    note: 'Experimental until its kidney-injury staging has had a clinical review.'
  },
  'time-to-event': {
    tier: 'experimental',
    title: 'Time-to-Event Explorer',
    note: 'Experimental until an external clinical review confirms its Kaplan–Meier estimates.'
  },
  'qt-explorer': {
    tier: 'experimental',
    title: 'QT Safety Explorer',
    note: 'Experimental: its settings and its table may still change.'
  },
  'patient-journey-explorer': {
    tier: 'prototype',
    title: 'Patient Journey Explorer'
  }
};
