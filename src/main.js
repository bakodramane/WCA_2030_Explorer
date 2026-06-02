import './ui/styles.css';
import { App } from './ui/App';
const app = new App();
app.mount('#app').catch(err => {
    console.error('[WCA Adviser] fatal mount error:', err);
});
