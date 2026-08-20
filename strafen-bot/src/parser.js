// Erkennt Euro-Betraege in Freitext-Nachrichten, da in der Gruppe kein
// einheitliches Format verwendet wird (z.B. "5€ zu spaet", "Strafe: 5,50 Euro -
// Handy vergessen", "5,- verpasstes Training").
const AMOUNT_REGEX =
  /(?:€\s*(\d{1,4}(?:[.,]\d{1,2})?))|(?:(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euro\b))|(?:(\d{1,4})\s*,-)/gi;

function toAmount(raw) {
  return parseFloat(raw.replace(',', '.'));
}

// Liefert alle im Text gefundenen Betraege inkl. eines heuristisch
// abgetrennten Grund-Texts. Nachrichten ohne erkennbaren Betrag werden von
// hasMatch=false markiert und landen zur manuellen Pruefung im Dashboard.
export function extractFines(text) {
  if (!text) return { amounts: [], hasMatch: false };

  const matches = [...text.matchAll(AMOUNT_REGEX)];
  if (matches.length === 0) return { amounts: [], hasMatch: false };

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
    let segment = prefix + ' ' + text.slice(matchEnd, nextStart);

    const reason = segment
      .replace(/^[\s,+\-;/•·]+/, '')
      .replace(/[\s,+\-;/•·]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    amounts.push({ amount, reason: reason || null });
  }

  return { amounts, hasMatch: amounts.length > 0 };
}
