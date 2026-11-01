import { mountNavigation } from './components/navigation.js';
import { notice } from './components/shared.js';

const page = mountNavigation();
const modules = { publish: './pages/publish.js', products: './pages/products.js', regions: './pages/regions.js', history: './pages/history.js' };
const mounts = { publish: 'mountPublish', products: 'mountProducts', regions: 'mountRegions', history: 'mountHistory' };
import(modules[page]).then(module => module[mounts[page]]()).catch(error => notice(error.message, true));
