// Public module collection. Renderer modules register themselves here as they
// land; shared Chart.js plugins will be registered here once one is shared by
// more than one module. Modules: histogram (#2), shift-plot (#14),
// delta-delta (#25), results-over-time (#27), outlier-explorer (#24).
import histogram from './histogram.js';
import shiftPlot from './shift-plot.js';
import deltaDelta from './delta-delta.js';
import resultsOverTime from './results-over-time.js';
import outlierExplorer from './outlier-explorer.js';

export { histogram, shiftPlot, deltaDelta, resultsOverTime, outlierExplorer };
export default { histogram, shiftPlot, deltaDelta, resultsOverTime, outlierExplorer };
