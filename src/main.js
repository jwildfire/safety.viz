// Public module collection. Renderer modules register themselves here as they
// land; shared Chart.js plugins will be registered here once one is shared by
// more than one module. First module: histogram (#2); results-over-time (#27).
import histogram from './histogram.js';
import resultsOverTime from './results-over-time.js';

export { histogram, resultsOverTime };
export default { histogram, resultsOverTime };
