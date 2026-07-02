const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AUTH_DIR = 'auth_info';
const SESSION_TAR = 'session.tar.gz';
const GROUP_JID_FILE = '.group_jid';
const REQUIRED_AUTH_FILES = ['creds.json', 'pre-keys'];

function validateSessionFiles() {
    if (!fs.existsSync(AUTH_DIR)) {
        throw new Error('Session directory missing: auth_info/');
    }
    
    const files = fs.readdirSync(AUTH_DIR);
    if (files.length === 0) {
        throw new Error('Session directory is empty');
    }
    
    const hasCreds = files.includes('creds.json');
    if (!hasCreds) {
        throw new Error('Missing creds.json - session may be corrupted');
    }
    
    console.log(`✓ Session files found: ${files.length} files`);
}

function ensureSessionRestored() {
    if (fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0) {
        console.log('✓ Session already restored');
        validateSessionFiles();
        return;
    }

    const encoded = process.env.WA_SESSION?.trim();
    if (!encoded) {
        throw new Error('No WhatsApp session found. Restore auth_info/ or provide WA_SESSION secret');
    }

    try {
        console.log('Restoring session from WA_SESSION...');
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        const buffer = Buffer.from(encoded, 'base64');
        console.log(`✓ Decoded ${buffer.length} bytes from base64`);
        
        fs.writeFileSync(SESSION_TAR, buffer);
        execFileSync('tar', ['-xzf', SESSION_TAR, '-C', '.'], { stdio: 'pipe' });
        console.log('✓ Extracted tar archive');
        
        validateSessionFiles();
        fs.unlinkSync(SESSION_TAR);
    } catch (e) {
        throw new Error(`Session restoration failed: ${e.message}`);
    }
}

function validateGroupJid(jid) {
    if (!jid || typeof jid !== 'string') {
        throw new Error('Invalid GROUP_JID: must be a non-empty string');
    }
    if (!jid.includes('@')) {
        throw new Error(`Invalid GROUP_JID format: "${jid}" (must contain @)`);
    }
    if (!jid.endsWith('@g.us') && !jid.endsWith('@s.whatsapp.net')) {
        throw new Error(`Invalid GROUP_JID domain: "${jid}" (must end with @g.us or @s.whatsapp.net)`);
    }
    console.log(`✓ Valid GROUP_JID: ${jid.replace(/[0-9]/g, '*')}`);
    return jid;
}

function getGroupJid(fromEnv = process.env.GROUP_JID) {
    let jid = null;
    
    if (fromEnv) {
        jid = fromEnv.trim();
    } else if (fs.existsSync(GROUP_JID_FILE)) {
        jid = fs.readFileSync(GROUP_JID_FILE, 'utf8').trim();
    }

    if (!jid) {
        throw new Error('GROUP_JID not set. Provide GROUP_JID secret or create .group_jid');
    }
    
    return validateGroupJid(jid);
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
    
    console.log('Fetching Baileys version...');
    const { version } = await fetchLatestBaileysVersion();
    console.log(`✓ Using Baileys version: ${version.version}`);
    
    console.log('Loading auth state...');
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    console.log('✓ Auth state loaded');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: 'error' }),
        browser: ['Ubuntu', 'Chrome', '22.0.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            sock.end();
            reject(new Error('Timeout 60s - no connection established'));
        }, 60000);
        let sent = false;
        let connected = false;

        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) console.log('QR code received (for manual auth)');
            
            if (connection === 'connecting') {
                console.log('Connecting to WhatsApp...');
            }
            
            if (connection === 'open') {
                connected = true;
                console.log('✓ Connected to WhatsApp');
                try {
                    const msg = getMessage();
                    console.log(`Sending message: "${msg}"`);
                    await sock.sendMessage(groupJid, { text: msg });
                    console.log(`[OK] SENT: "${msg}"`);
                    sent = true;
                    clearTimeout(timeout);
                    setTimeout(() => { sock.end(); resolve(); }, 2000);
                } catch (e) {
                    clearTimeout(timeout);
                    reject(new Error(`Failed to send message: ${e.message}`));
                }
            }
            
            if (connection === 'close') {
                if (sent) return; // normal close after send — ignore
                clearTimeout(timeout);
                const code = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.message || 'Unknown';
                
                if (code === DisconnectReason.loggedOut) {
                    reject(new Error('Session expired — WhatsApp logged out. Re-run setup.js and update WA_SESSION'));
                } else if (code === DisconnectReason.connectionClosed) {
                    reject(new Error('Connection closed by server'));
                } else if (code === DisconnectReason.connectionLost) {
                    reject(new Error('Connection lost - network issue'));
                } else if (code === DisconnectReason.restartRequired) {
                    reject(new Error('Restart required by WhatsApp'));
                } else {
                    reject(new Error(`Connection failed: ${reason} (code: ${code})${!connected ? ' - failed to connect' : ''}` ));
                }
            }
        });
    });
}

if (require.main === module) {
    send().catch(e => { console.error('[FAIL]', e.message); process.exit(1); });
}

module.exports = { ensureSessionRestored, getGroupJid, getMessage };
