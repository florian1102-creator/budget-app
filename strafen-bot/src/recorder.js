import { extractFines } from './parser.js';
import { store } from './store.js';

// Gemeinsame Speicherlogik fuer Live-Nachrichten, Chatverlauf-Sync beim
// Koppeln und manuellen Export-Import. `id` muss je Quelle eindeutig und bei
// wiederholtem Aufruf (Reconnect, erneuter Import) stabil sein, damit
// Dopplungen erkannt und uebersprungen werden.
export function recordParsedMessage({ id, phone, name, text, timestamp, source }) {
  const { amounts, hasMatch } = extractFines(text);

  if (!hasMatch) {
    const unparsed = store.getUnparsed();
    if (unparsed.some((u) => u.id === id)) return { added: 0, unparsed: 0 };
    unparsed.push({ id, phone, name, text, timestamp });
    store.saveUnparsed(unparsed.slice(-500));
    return { added: 0, unparsed: 1 };
  }

  const fines = store.getFines();
  let added = 0;
  amounts.forEach((a, idx) => {
    const fineId = `${id}-${idx}`;
    if (fines.some((f) => f.id === fineId)) return;
    fines.push({ id: fineId, phone, name, amount: a.amount, reason: a.reason, text, timestamp, source });
    added++;
  });
  if (added) store.saveFines(fines);
  return { added, unparsed: 0 };
}
