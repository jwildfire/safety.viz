// Public module collection. Renderer modules register themselves here as they
// land; shared Chart.js plugins will be registered here once one is shared by
// more than one module. Modules: histogram (#2), shift-plot (#14),
// delta-delta (#25), results-over-time (#27), outlier-explorer (#24),
// ae-timelines (#26), hep-explorer (#43), ae-explorer (#60), qt-explorer (#68),
// hep-waterfall (#93), participant-profile (#98).
import histogram from './histogram.js';
import shiftPlot from './shift-plot.js';
import deltaDelta from './delta-delta.js';
import resultsOverTime from './results-over-time.js';
import outlierExplorer from './outlier-explorer.js';
import aeTimelines from './ae-timelines.js';
import hepExplorer from './hep-explorer.js';
import aeExplorer from './ae-explorer.js';
import qtExplorer from './qt-explorer.js';
import hepWaterfall from './hep-waterfall.js';
import participantProfile from './participant-profile.js';

export {
  histogram,
  shiftPlot,
  deltaDelta,
  resultsOverTime,
  outlierExplorer,
  aeTimelines,
  hepExplorer,
  aeExplorer,
  qtExplorer,
  hepWaterfall,
  participantProfile
};
export default {
  histogram,
  shiftPlot,
  deltaDelta,
  resultsOverTime,
  outlierExplorer,
  aeTimelines,
  hepExplorer,
  aeExplorer,
  qtExplorer,
  hepWaterfall,
  participantProfile
};
