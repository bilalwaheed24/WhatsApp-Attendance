const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const { execFileSync } = require('child_process');

const AUTH_DIR = 'auth_info';
const SESSION_TAR = 'session.tar.gz';
const GROUP_JID_FILE = '.group_jid';

function ensureSessionRestored() {
    if (fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0) {
        return;
    }

    const encoded = process.env.WA_SESSION?.trim();
    if (!encoded) {
        throw new Error('No WhatsApp session found. Restore auth_info/ or provide WA_SESSION secret');
    }

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(SESSION_TAR, Buffer.from(encoded, 'base64'));
    execFileSync('tar', ['-xzf', SESSION_TAR, '-C', '.'], { stdio: 'inherit' });
}

function getGroupJid(fromEnv = process.env.GROUP_JID) {
    if (fromEnv) return fromEnv;

    if (fs.existsSync(GROUP_JID_FILE)) {
        return fs.readFileSync(GROUP_JID_FILE, 'utf8').trim();
    }

    throw new Error('GROUP_JID not set. Provide GROUP_JID secret or create .group_jid');
}

function getMessage() {
    const day = new Date().toLocaleDateString('en-US', {
        timeZone: 'Asia/Karachi', day: 'numeric'
    });
    return `off ${day}`;
}

async function send() {
    ensureSessionRestored();

    const groupJid = getGroupJid();
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: 'error' }),
        browser: ['Ubuntu', 'Chrome', '22.0.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout 45s')), 45000);
        let sent = false;

        sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (connection === 'open') {
                const msg = getMessage();
                await sock.sendMessage(groupJid, { text: msg });
                console.log(`[OK] SENT: "${msg}"`);
                sent = true;
                clearTimeout(timeout);
                setTimeout(() => { sock.end(); resolve(); }, 3000);
            }
            if (connection === 'close') {
                if (sent) return; // normal close after send — ignore
                clearTimeout(timeout);
                const code = lastDisconnect?.error?.output?.statusCode;
                if (code === DisconnectReason.loggedOut) {
                    reject(new Error('Session expired — re-run setup.js and update WA_SESSION secret'));
                } else {
                    reject(new Error(`Connection closed: ${code}`));
                }
            }
        });
    });
}

if (require.main === module) {
    send().catch(e => { console.error('[FAIL]', e.message); process.exit(1); });
}

module.exports = { ensureSessionRestored, getGroupJid, getMessage };
