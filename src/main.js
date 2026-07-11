// Public module collection. Renderer modules register themselves here as they
// land; shared Chart.js plugins will be registered here once one is shared by
// more than one module. First module: histogram (#2); outlier-explorer (#24).
import histogram from './histogram.js';
import outlierExplorer from './outlier-explorer.js';

export { histogram, outlierExplorer };
export default { histogram, outlierExplorer };
