# Strafen-Bot – TSV Karpfham

Liest die Strafgruppe der Mannschaft auf WhatsApp automatisch mit, erkennt
Strafen aus den Nachrichten (auch bei uneinheitlichem Format) und zeigt sie
in einem Web-Dashboard als Tabelle pro Person an – inklusive CSV-Export.

## Wichtig: Wie das technisch funktioniert (bitte lesen)

Es gibt **keine offizielle WhatsApp-API**, die normale Gruppen von
Privatpersonen automatisiert mitlesen kann (die offizielle WhatsApp Business
API ist nur für 1:1-Business-Chats gedacht). Dieser Bot koppelt sich
stattdessen wie **WhatsApp Web/Desktop** per QR-Code als zusätzliches Gerät
an einen echten WhatsApp-Account (Bibliothek: [Baileys](https://github.com/WhiskeySockets/Baileys)).

- **Nutzungsbedingungen:** Das ist eine inoffizielle Methode und verstößt
  formal gegen die WhatsApp-Nutzungsbedingungen (Automatisierung eines
  Accounts). Bei reinem Mitlesen ohne Massen-Nachrichten/Spam ist das Risiko
  einer Sperrung in der Praxis gering, aber nicht null. **Empfehlung:**
  koppelt ein Zweit-Handy bzw. eine separate Vereinsnummer, nicht die
  private Hauptnummer eines Spielers.
- **Datenschutz / Gruppen-Beschränkung:** Technisch sieht die gekoppelte
  Sitzung wie jedes WhatsApp-Web-Gerät den Nachrichtenstrom aller Chats
  dieses Accounts. Der Bot-Code selbst verarbeitet und speichert aber
  **ausschließlich Nachrichten aus der einen konfigurierten Zielgruppe**
  (`TARGET_GROUP_JID`/`TARGET_GROUP_NAME`) – siehe `handleIncomingMessage`
  in `src/whatsapp.js`. Alles andere wird in derselben Codezeile sofort
  verworfen, nie gespeichert und nie geloggt. Der Rest des Accounts bleibt
  damit softwareseitig privat, auch wenn die zugrundeliegende Verbindung
  technisch mehr sehen könnte.
- Nutzt dafür idealerweise ein Konto, das ohnehin schon Mitglied der
  Strafgruppe ist (z. B. das des Kassiers/Trainers).

## Setup

1. **Node.js ≥ 18** installieren.
2. Abhängigkeiten installieren:
   ```bash
   cd strafen-bot
   npm install
   ```
3. `.env` aus der Vorlage anlegen und anpassen:
   ```bash
   cp .env.example .env
   ```
   - `DASHBOARD_PASSWORD` unbedingt setzen (Strafen sind personenbezogene Daten).
   - `TARGET_GROUP_NAME` ist bereits auf `Strafen TSV` voreingestellt (der Name eurer Gruppe).
4. Bot starten:
   ```bash
   npm start
   ```
5. Es erscheint ein QR-Code in der Konsole (und unter `http://localhost:3000/qr`
   im Dashboard). Mit dem WhatsApp-Account scannen: **WhatsApp → Einstellungen
   → Verknüpfte Geräte → Gerät verknüpfen**.
6. Nach dem Verbinden zeigt die Konsole alle Gruppen des Accounts mit ihrer
   JID an. Prüfen, ob die richtige Gruppe erkannt wurde. Für Dauerbetrieb
   empfiehlt es sich, die angezeigte JID fest in `TARGET_GROUP_JID` in der
   `.env` einzutragen (eindeutiger als der Name).
7. Dashboard öffnen: `http://localhost:3000` (Login: beliebiger Nutzername + `DASHBOARD_PASSWORD`).

Die Kopplung bleibt im Ordner `auth/` gespeichert, ein Neustart des Bots
erfordert keinen erneuten QR-Scan (bis der Account manuell "Verknüpfte
Geräte" trennt oder ausgeloggt wird).

## Bereits vorhandene Strafen in der Gruppe erfassen

Zwei Wege, damit auch Beträge erfasst werden, die schon vor dem Koppeln in
der Gruppe standen:

1. **Automatischer Verlaufs-Sync (meist ausreichend):** Beim ersten Koppeln
   schickt das Haupt-Handy je nach der beim Verknüpfen gewählten Option
   ("Kein/3 Monate/1 Jahr/Alle Chats einbeziehen") einen Teil des
   Chatverlaufs an den Bot. Dieser wird automatisch genauso ausgewertet wie
   neue Nachrichten – ohne zusätzlichen Schritt.
2. **Manueller Import (falls der Sync nicht weit genug zurückreicht):** Im
   Dashboard unter **"Bereits vorhandene Nachrichten importieren"** den
   Inhalt einer WhatsApp-Chat-Export-Datei einfügen (Gruppe → Mehr → Chat
   exportieren → *Ohne Medien*). Wird derselbe Text mehrfach importiert,
   werden bereits erfasste Nachrichten automatisch übersprungen – es kommt
   nicht zu doppelter Zählung.

## Wie die Strafen erkannt werden

Der Parser (`src/parser.js`) sucht in jeder Nachricht nach Euro-Beträgen in
gängigen Schreibweisen: `5€`, `5 €`, `5,50€`, `5 Euro`, `€5`, `5,-` usw.
Enthält eine Nachricht kein Währungszeichen, wird zusätzlich eine **nackte
Zahl am Anfang** der Nachricht als Betrag erkannt (z. B. `5` oder
`5 zu spät`, laut Rückmeldung aus der Mannschaft der häufigste Fall) – aber
nur, wenn die Zahl das erste Wort der Nachricht ist, um Zahlen mitten im
Fließtext nicht fälschlich zu erfassen. Der restliche Text der Nachricht
wird als Grund übernommen. Da die Mannschaft kein einheitliches Format
nutzt, wird das nicht immer perfekt sitzen:

- Nachrichten **ohne erkennbaren Betrag** landen im Dashboard unter
  **"Zu prüfen"** – dort lassen sie sich manuell mit Betrag/Grund einer
  Person zuordnen oder verwerfen.
- Jeder automatisch erkannte Eintrag lässt sich in der Tabelle **löschen**,
  falls die Erkennung danebenliegt (Bearbeiten kann bei Bedarf leicht
  ergänzt werden – aktuell: löschen und über "Zu prüfen"/manuell neu anlegen).
- Über das Formular unten in der Tabelle lassen sich Strafen auch komplett
  **manuell** hinzufügen.

## Namenszuordnung

WhatsApp liefert nur Telefonnummer und den (änderbaren) Anzeigenamen des
Absenders. Für konsistente Namen in der Tabelle kann eine feste Zuordnung
Telefonnummer → Vereinsname hinterlegt werden:

```bash
curl -u irgendwer:$DASHBOARD_PASSWORD -X POST http://localhost:3000/api/members \
  -H "Content-Type: application/json" \
  -d '{"phone":"4915112345678","name":"Max Mustermann"}'
```

(Die Nummer im internationalen Format ohne `+`, wie sie im Bot-Log/den
Daten auftaucht.)

## Dauerbetrieb (Hosting)

Der Bot muss durchgehend laufen, damit keine Nachrichten verpasst werden.
Optionen:

- **Vereins-PC / Raspberry Pi:** `npm start` z. B. mit [pm2](https://pm2.keymetrics.io/)
  im Hintergrund halten und beim Booten automatisch starten:
  ```bash
  npm install -g pm2
  pm2 start src/index.js --name strafen-bot
  pm2 save
  pm2 startup
  ```
- **Kleiner VPS** (Hetzner, DigitalOcean, …): gleiches Vorgehen, plus eigenen
  Reverse Proxy (z. B. nginx) mit HTTPS vor den Port `3000` schalten, bevor
  das Dashboard von unterwegs erreichbar gemacht wird.

## Datenablage

Alle Daten liegen als JSON-Dateien in `strafen-bot/data/` (`fines.json`,
`unparsed.json`, `members.json`) – einfach zu sichern, zu inspizieren oder
zurückzusetzen (Datei löschen). Diese Dateien sowie der Kopplungsordner
`auth/` sind in `.gitignore` und werden **nicht** ins Repository committet.
