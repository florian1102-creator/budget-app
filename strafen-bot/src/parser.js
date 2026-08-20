// Erkennt Euro-Betraege in Freitext-Nachrichten, da in der Gruppe kein
// einheitliches Format verwendet wird (z.B. "5€ zu spaet", "Strafe: 5,50 Euro -
// Handy vergessen", "5,- verpasstes Training").
const AMOUNT_REGEX =
  /(?:€\s*(\d{1,4}(?:[.,]\d{1,2})?))|(?:(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euro\b))|(?:(\d{1,4})\s*,-)/gi;

// Fallback fuer Nachrichten, die nur aus einer nackten Zahl bestehen (ohne
// €-Zeichen), z.B. "5" oder "5 zu spaet" -- laut Rueckmeldung aus der Gruppe
// der haeufigste Fall. Nur am Anfang der Nachricht, um Zahlen mitten im
// Fliesstext (Datumsangaben etc.) nicht faelschlich zu erfassen.
const BARE_NUMBER_REGEX = /^(?:strafe:?\s*)?(\d{1,3}(?:[.,]\d{1,2})?)(?=\s|$)/i;

function toAmount(raw) {
  return parseFloat(raw.replace(',', '.'));
}

function cleanReason(segment) {
  return segment
    .replace(/^[\s,+\-;/•·]+/, '')
    .replace(/[\s,+\-;/•·]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Liefert alle im Text gefundenen Betraege inkl. eines heuristisch
// abgetrennten Grund-Texts. Nachrichten ohne erkennbaren Betrag werden von
// hasMatch=false markiert und landen zur manuellen Pruefung im Dashboard.
export function extractFines(text) {
  if (!text) return { amounts: [], hasMatch: false };

  const matches = [...text.matchAll(AMOUNT_REGEX)];
  const amounts = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const raw = m[1] || m[2] || m[3];
    const amount = toAmount(raw);

    // Plausibilitaets-Filter gegen offensichtliche Fehltreffer (z.B. Datumsangaben)
    if (!amount || amount <= 0 || amount > 1000) continue;

    // Grund-Text: alles zwischen diesem Betrag und dem naechsten (bzw. dem
    // Ende der Nachricht beim letzten Treffer). Der Text vor dem allerersten
    // Betrag wird zusaetzlich dem ersten Eintrag zugeschlagen, damit nichts
    // verloren geht (z.B. "Strafe: 5€ ...").
    const matchEnd = m.index + m[0].length;
    const nextStart = i === matches.length - 1 ? text.length : matches[i + 1].index;
    const prefix = i === 0 ? text.slice(0, m.index) : '';
    const segment = prefix + ' ' + text.slice(matchEnd, nextStart);

    amounts.push({ amount, reason: cleanReason(segment) || null });
  }

  if (amounts.length > 0) return { amounts, hasMatch: true };

  const trimmed = text.trim();
  const bare = trimmed.match(BARE_NUMBER_REGEX);
  if (bare) {
    const amount = toAmount(bare[1]);
    if (amount > 0 && amount <= 1000) {
      const reason = cleanReason(trimmed.slice(bare[0].length));
      return { amounts: [{ amount, reason: reason || null }], hasMatch: true };
    }
  }

  return { amounts: [], hasMatch: false };
}
