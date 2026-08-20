import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { store } from './store.js';
import { getStatus } from './whatsapp.js';
import { importExport } from './importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function basicAuth(req, res, next) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return next(); // kein Passwort gesetzt -> nur fuer lokale Tests geeignet!

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const pass = decoded.slice(decoded.indexOf(':') + 1);
    if (pass === password) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Strafen Dashboard"');
  return res.status(401).send('Authentifizierung erforderlich.');
}

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function createServer() {
  const app = express();
  app.use(express.json());
  app.use(basicAuth);

  app.get('/api/status', (req, res) => {
    const s = getStatus();
    res.json({ status: s.status, groupJid: s.groupJid, groupName: s.groupName, hasQr: !!s.qr });
  });

  app.get('/qr', (req, res) => {
    const s = getStatus();
    if (!s.qr) return res.status(404).send('Kein QR-Code verfuegbar (bereits verbunden oder noch nicht bereit).');
    const img = Buffer.from(s.qr.split(',')[1], 'base64');
    res.set('Content-Type', 'image/png');
    res.send(img);
  });

  app.get('/api/fines', (req, res) => {
    let fines = store.getFines();
    const { from, to, name } = req.query;
    if (from) fines = fines.filter((f) => f.timestamp >= new Date(from).getTime());
    if (to) fines = fines.filter((f) => f.timestamp <= new Date(to).getTime() + 86400000);
    if (name) fines = fines.filter((f) => f.name === name);
    fines.sort((a, b) => b.timestamp - a.timestamp);
    res.json(fines);
  });

  app.post('/api/fines', (req, res) => {
    const { name, amount, reason, date } = req.body;
    if (!name || !amount) return res.status(400).json({ error: 'name und amount sind erforderlich' });
    const fines = store.getFines();
    const entry = {
      id: `manual-${Date.now()}`,
      phone: null,
      name,
      amount: Number(amount),
      reason: reason || null,
      text: null,
      timestamp: date ? new Date(date).getTime() : Date.now(),
      source: 'manual',
    };
    fines.push(entry);
    store.saveFines(fines);
    res.status(201).json(entry);
  });

  app.put('/api/fines/:id', (req, res) => {
    const fines = store.getFines();
    const idx = fines.findIndex((f) => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'nicht gefunden' });
    const { name, amount, reason, date } = req.body;
    if (name !== undefined) fines[idx].name = name;
    if (amount !== undefined) fines[idx].amount = Number(amount);
    if (reason !== undefined) fines[idx].reason = reason;
    if (date !== undefined) fines[idx].timestamp = new Date(date).getTime();
    store.saveFines(fines);
    res.json(fines[idx]);
  });

  app.delete('/api/fines/:id', (req, res) => {
    let fines = store.getFines();
    const before = fines.length;
    fines = fines.filter((f) => f.id !== req.params.id);
    store.saveFines(fines);
    res.json({ deleted: before - fines.length });
  });

  app.get('/api/summary', (req, res) => {
    const fines = store.getFines();
    const byName = {};
    for (const f of fines) byName[f.name] = (byName[f.name] || 0) + f.amount;
    const summary = Object.entries(byName)
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
    res.json({ summary, grandTotal: Math.round(summary.reduce((s, x) => s + x.total, 0) * 100) / 100 });
  });

  app.get('/api/unparsed', (req, res) => {
    res.json(store.getUnparsed().sort((a, b) => b.timestamp - a.timestamp));
  });

  app.post('/api/unparsed/:id/dismiss', (req, res) => {
    const unparsed = store.getUnparsed().filter((u) => u.id !== req.params.id);
    store.saveUnparsed(unparsed);
    res.json({ ok: true });
  });

  app.post('/api/unparsed/:id/accept', (req, res) => {
    const unparsed = store.getUnparsed();
    const item = unparsed.find((u) => u.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'nicht gefunden' });
    const { amount, reason, name } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount ist erforderlich' });

    const fines = store.getFines();
    fines.push({
      id: `resolved-${item.id}`,
      phone: item.phone,
      name: name || item.name,
      amount: Number(amount),
      reason: reason || null,
      text: item.text,
      timestamp: item.timestamp,
      source: 'manual-review',
    });
    store.saveFines(fines);
    store.saveUnparsed(unparsed.filter((u) => u.id !== item.id));
    res.status(201).json({ ok: true });
  });

  // Einmaliger Import eines von WhatsApp exportierten Chatverlaufs (Gruppe →
  // Mehr → Chat exportieren → ohne Medien), fuer bereits vorhandene Strafen,
  // die der automatische Verlaufs-Sync beim Koppeln nicht erfasst hat.
  app.post('/api/import', (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text ist erforderlich' });
    const result = importExport(text);
    res.json(result);
  });

  app.get('/api/members', (req, res) => {
    res.json(store.getMembers());
  });

  app.post('/api/members', (req, res) => {
    const { phone, name } = req.body;
    if (!phone || !name) return res.status(400).json({ error: 'phone und name sind erforderlich' });
    const members = store.getMembers();
    members[phone] = name;
    store.saveMembers(members);
    res.json(members);
  });

  app.get('/export.csv', (req, res) => {
    const fines = store.getFines().slice().sort((a, b) => a.timestamp - b.timestamp);
    const rows = [['Datum', 'Name', 'Betrag (€)', 'Grund']];
    fines.forEach((f) => {
      rows.push([
        new Date(f.timestamp).toLocaleDateString('de-DE'),
        f.name,
        f.amount.toFixed(2).replace('.', ','),
        f.reason || '',
      ]);
    });
    const csv = rows.map((r) => r.map(escapeCsv).join(';')).join('\r\n');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="strafen-tsv-karpfham.csv"');
    res.send('﻿' + csv);
  });

  // Statische Dashboard-Dateien zuletzt, damit /api/* und /export.csv Vorrang haben.
  app.use(express.static(path.join(__dirname, 'public')));

  return app;
}
