// Public module collection. Renderer modules register themselves here as they
// land; shared Chart.js plugins will be registered here once one is shared by
// more than one module. First module: histogram (#2); second: shift-plot (#14).
import histogram from './histogram.js';
import shiftPlot from './shift-plot.js';

export { histogram, shiftPlot };
export default { histogram, shiftPlot };
