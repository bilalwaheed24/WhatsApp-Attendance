const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');

const GROUP_JID = process.env.GROUP_JID;
if (!GROUP_JID) { console.error('[ERROR] GROUP_JID not set'); process.exit(1); }

function getMessage() {
    const day = new Date().toLocaleDateString('en-US', {
        timeZone: 'Asia/Karachi', day: 'numeric'
    });
    return `off ${day}`;
}

async function send() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: 'error' }),
        browser: ['Ubuntu', 'Chrome', '22.0.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout 45s')), 45000);

        sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (connection === 'open') {
                const msg = getMessage();
                await sock.sendMessage(GROUP_JID, { text: msg });
                console.log(`[OK] SENT: "${msg}"`);
                clearTimeout(timeout);
                setTimeout(() => { sock.end(); resolve(); }, 3000);
            }
            if (connection === 'close') {
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

send().catch(e => { console.error('[FAIL]', e.message); process.exit(1); });
