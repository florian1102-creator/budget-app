import { recordParsedMessage } from './recorder.js';

// Deckt die beiden gaengigen WhatsApp-Export-Formate ab:
//   Android: "24.08.23, 18:32 - Max Mustermann: 5€ zu spaet"
//   iPhone:  "[24.08.23, 18:32:01] Max Mustermann: 5€ zu spaet"
const LINE_BRACKET = /^\[(\d{1,2}[./]\d{1,2}[./]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[AP]M)?\]\s*(.*)$/i;
const LINE_DASH = /^(\d{1,2}[./]\d{1,2}[./]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[AP]M)?\s*-\s*(.*)$/i;

function parseTimestamp(dateStr, timeStr) {
  const [d, m, yRaw] = dateStr.split(/[./]/).map(Number);
  const y = yRaw < 100 ? 2000 + yRaw : yRaw;
  const [h, min, sec] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, h, min || 0, sec || 0).getTime();
}

function splitNameText(rest) {
  const idx = rest.indexOf(': ');
  if (idx === -1) return null;
  return { name: rest.slice(0, idx).trim(), text: rest.slice(idx + 2) };
}

// Zerlegt den rohen Export-Text in einzelne Nachrichten (mehrzeilige
// Nachrichten werden der jeweils vorangehenden Kopfzeile zugeordnet;
// Systemmeldungen ohne "Name: Text"-Form werden uebersprungen).
export function parseExport(raw) {
  const lines = raw.split(/\r?\n/);
  const messages = [];
  let current = null;

  for (const line of lines) {
    const bracket = line.match(LINE_BRACKET);
    const dash = !bracket ? line.match(LINE_DASH) : null;
    const match = bracket || dash;

    if (match) {
      if (current) messages.push(current);
      const [, date, time, rest] = match;
      const parts = splitNameText(rest);
      current = parts ? { timestamp: parseTimestamp(date, time), name: parts.name, text: parts.text } : null;
    } else if (current) {
      current.text += '\n' + line;
    }
  }
  if (current) messages.push(current);
  return messages;
}

export function importExport(raw) {
  const parsed = parseExport(raw);
  let added = 0;
  let unparsed = 0;

  parsed.forEach((m, idx) => {
    const id = `import-${m.timestamp}-${idx}`;
    const result = recordParsedMessage({
      id,
      phone: null,
      name: m.name,
      text: m.text,
      timestamp: m.timestamp,
      source: 'import',
    });
    added += result.added;
    unparsed += result.unparsed;
  });

  return { messagesFound: parsed.length, added, unparsed };
}
