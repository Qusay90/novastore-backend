import {authorizeWorkshop,showWorkshopFailure} from './workshop/auth.js';
authorizeWorkshop().then(()=>import('./android-entry.tsx')).catch(showWorkshopFailure);
