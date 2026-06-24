const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const { execSync } = require('child_process');
const fs = require('fs');

async function setup() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '22.0.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
        if (qr) {
            console.log('\n=== SCAN THIS QR IN WHATSAPP ===');
            console.log('WhatsApp > Settings > Linked Devices > Link a Device\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('\n[CONNECTED] Fetching groups...');
            await new Promise(r => setTimeout(r, 4000));

            try {
                const groups = await sock.groupFetchAllParticipating();
                const list = Object.entries(groups).map(([jid, g]) => ({ jid, name: g.subject }));
                console.log('\n=== YOUR GROUPS ===');
                list.forEach((g, i) => console.log(`${i + 1}. "${g.name}"\n   JID: ${g.jid}`));

                const target = list.find(g =>
                    g.name.toLowerCase().includes('night shift') ||
                    g.name.toLowerCase().includes('online support')
                );
                if (target) {
                    console.log(`\n>>> FOUND: "${target.name}"`);
                    console.log(`>>> JID: ${target.jid}`);
                    fs.writeFileSync('.group_jid', target.jid);
                }
            } catch (e) {
                console.error('Groups fetch error:', e.message);
            }

            try {
                execSync('tar -czf session.tar.gz auth_info/');
                const encoded = fs.readFileSync('session.tar.gz').toString('base64');
                fs.writeFileSync('session_b64.txt', encoded);
                console.log('\n[DONE] session_b64.txt created');
                console.log('[DONE] .group_jid created');
                console.log('\nSetup complete! Tell Claude to set GitHub secrets now.');
            } catch (e) {
                console.error('Session encode error:', e.message);
            }

            sock.end();
            process.exit(0);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                console.error('Logged out. Delete auth_info/ and restart.');
                process.exit(1);
            }
            // QR expired or timeout — retry
            console.log('QR expired or connection lost. Retrying...');
            setup();
        }
    });
}

setup();
