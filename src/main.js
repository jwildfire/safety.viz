// Public module collection. Renderer modules register themselves here as they
// land; shared Chart.js plugins will be registered here once one is shared by
// more than one module. Modules: histogram (#2), aeTimelines (#26).
import histogram from './histogram.js';
import aeTimelines from './ae-timelines.js';

export { histogram, aeTimelines };
export default { histogram, aeTimelines };
