import baileysPkg from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFines } from './parser.js';
import { store } from './store.js';

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileysPkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', 'auth');

let latestQr = null;
let connectionStatus = 'starting'; // starting | qr | connected | disconnected
let resolvedGroupJid = process.env.TARGET_GROUP_JID || null;
let resolvedGroupName = null;

export function getStatus() {
  return { status: connectionStatus, qr: latestQr, groupJid: resolvedGroupJid, groupName: resolvedGroupName };
}

export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = await QRCode.toDataURL(qr);
      connectionStatus = 'qr';
      qrcodeTerminal.generate(qr, { small: true });
      console.log('QR-Code zum Koppeln bereit (auch abrufbar unter /qr im Dashboard).');
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      latestQr = null;
      console.log('WhatsApp verbunden.');
      await resolveTargetGroup(sock);
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected';
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log('Verbindung getrennt.', loggedOut ? '(ausgeloggt)' : '(versuche erneut zu verbinden...)');
      if (!loggedOut) {
        startWhatsApp();
      } else {
        console.log('Ausgeloggt. Bitte den Ordner "auth/" loeschen und den Bot neu per QR-Code koppeln.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      await handleIncomingMessage(msg);
    }
  });

  return sock;
}

async function resolveTargetGroup(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups);

    if (resolvedGroupJid) {
      const match = list.find((g) => g.id === resolvedGroupJid);
      resolvedGroupName = match ? match.subject : '(Gruppe nicht in der Teilnehmerliste gefunden)';
      console.log(`Ziel-Gruppe fest per JID konfiguriert: ${resolvedGroupName} (${resolvedGroupJid})`);
      return;
    }

    const targetName = (process.env.TARGET_GROUP_NAME || '').trim().toLowerCase();
    if (!targetName) {
      console.warn('Weder TARGET_GROUP_JID noch TARGET_GROUP_NAME gesetzt. Der Bot ignoriert alle Nachrichten, bis eine Zielgruppe konfiguriert ist.');
      logAvailableGroups(list);
      return;
    }

    const matches = list.filter((g) => g.subject.toLowerCase().includes(targetName));
    if (matches.length === 1) {
      resolvedGroupJid = matches[0].id;
      resolvedGroupName = matches[0].subject;
      console.log(`Ziel-Gruppe gefunden: "${resolvedGroupName}" (${resolvedGroupJid})`);
      console.log(`Tipp: Trage TARGET_GROUP_JID=${resolvedGroupJid} in die .env ein, um das dauerhaft eindeutig festzulegen.`);
    } else if (matches.length === 0) {
      console.warn(`Keine Gruppe mit Namen "${process.env.TARGET_GROUP_NAME}" gefunden.`);
      logAvailableGroups(list);
    } else {
      console.warn(`Mehrere Gruppen passen auf "${process.env.TARGET_GROUP_NAME}". Bitte TARGET_GROUP_JID in der .env eindeutig setzen:`);
      logAvailableGroups(matches);
    }
  } catch (e) {
    console.error('Fehler beim Auflösen der Zielgruppe:', e);
  }
}

function logAvailableGroups(list) {
  console.log('Verfuegbare Gruppen dieses Accounts:');
  list.forEach((g) => console.log(`  - ${g.subject}  (${g.id})`));
}

// Datenschutz-Kernstueck: Der gekoppelte Account sieht technisch alle Chats,
// aber alles ausserhalb der konfigurierten Zielgruppe wird hier sofort
// verworfen -- es wird nichts davon gespeichert oder geloggt.
async function handleIncomingMessage(msg) {
  if (!resolvedGroupJid || msg.key.remoteJid !== resolvedGroupJid) return;
  if (msg.key.fromMe) return;

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    '';

  if (!text.trim()) return;

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const phone = senderJid.split('@')[0];
  const members = store.getMembers();
  const senderName = members[phone] || msg.pushName || phone;

  const { amounts, hasMatch } = extractFines(text);
  const timestamp = (Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000;

  if (!hasMatch) {
    const unparsed = store.getUnparsed();
    unparsed.push({ id: msg.key.id, phone, name: senderName, text, timestamp });
    store.saveUnparsed(unparsed.slice(-500));
    return;
  }

  const fines = store.getFines();
  amounts.forEach((a, idx) => {
    fines.push({
      id: `${msg.key.id}-${idx}`,
      phone,
      name: senderName,
      amount: a.amount,
      reason: a.reason,
      text,
      timestamp,
      source: 'auto',
    });
  });
  store.saveFines(fines);
}
