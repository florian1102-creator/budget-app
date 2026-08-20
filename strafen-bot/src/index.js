import 'dotenv/config';
import { startWhatsApp } from './whatsapp.js';
import { createServer } from './server.js';

const PORT = process.env.PORT || 3000;

async function main() {
  if (!process.env.DASHBOARD_PASSWORD) {
    console.warn('WARNUNG: DASHBOARD_PASSWORD ist nicht gesetzt -- das Dashboard ist ungeschuetzt erreichbar!');
  }

  await startWhatsApp();
  const app = createServer();
  app.listen(PORT, () => {
    console.log(`Dashboard laeuft auf http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fataler Fehler beim Start:', err);
  process.exit(1);
});
