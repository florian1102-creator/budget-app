import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function readJson(name, fallback) {
  ensureDataDir();
  const p = filePath(name);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Fehler beim Lesen von ${name}:`, e);
    return fallback;
  }
}

function writeJson(name, data) {
  ensureDataDir();
  const p = filePath(name);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

export const store = {
  getFines: () => readJson('fines.json', []),
  saveFines: (fines) => writeJson('fines.json', fines),

  getUnparsed: () => readJson('unparsed.json', []),
  saveUnparsed: (items) => writeJson('unparsed.json', items),

  getMembers: () => readJson('members.json', {}),
  saveMembers: (members) => writeJson('members.json', members),
};
