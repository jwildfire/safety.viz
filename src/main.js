// Public module collection. Renderer modules register themselves here as they
// land; shared Chart.js plugins will be registered here once one is shared by
// more than one module. First module: histogram (#2); delta-delta (#25).
import histogram from './histogram.js';
import deltaDelta from './delta-delta.js';

export { histogram, deltaDelta };
export default { histogram, deltaDelta };
