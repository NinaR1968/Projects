// Temporary page for screens that are not connected to the function yet (ADR-2).
// Each milestone that builds a screen points its HTML back to the page's own module.
import { initPage } from '../nav.js';
import { stateCard } from '../ui.js';

const { title, active } = document.body.dataset;
const frame = await initPage({ title, active });
if (frame) frame.main.append(stateCard('info', 'המסך הזה ייפתח בשלב הבא של הבנייה'));
