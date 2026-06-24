// Run ONCE locally: node setup.js
// Scan QR → groups list → session saved
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const { execSync } = require('child_process');
const fs = require('fs');

async function setup() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
        if (qr) {
            console.log('\n=== SCAN THIS QR IN WHATSAPP ===\n');
            qrcode.generate(qr, { small: true });
            console.log('\nWhatsApp > Settings > Linked Devices > Link a Device\n');
        }

        if (connection === 'open') {
            console.log('[CONNECTED] Fetching groups...\n');

            // Wait for store to load
            await new Promise(r => setTimeout(r, 3000));

            try {
                const groups = await sock.groupFetchAllParticipating();
                const list = Object.entries(groups).map(([jid, g]) => ({ jid, name: g.subject }));

                console.log('=== YOUR GROUPS ===');
                list.forEach((g, i) => console.log(`${i + 1}. "${g.name}"\n   JID: ${g.jid}`));

                const target = list.find(g => g.name.toLowerCase().includes('night shift'));
                if (target) {
                    console.log(`\n>>> TARGET FOUND: ${target.name}`);
                    console.log(`>>> GROUP_JID = ${target.jid}`);
                    fs.writeFileSync('.group_jid', target.jid);
                    console.log('>>> Saved to .group_jid file\n');
                } else {
                    console.log('\nCopy the JID for "Online Support Night Shift" from list above.');
                    console.log('Save it: echo "JID_HERE" > .group_jid\n');
                }
            } catch (e) {
                console.error('Could not fetch groups:', e.message);
            }

            // Encode session
            try {
                execSync('tar -czf session.tar.gz auth_info/');
                const encoded = fs.readFileSync('session.tar.gz').toString('base64');
                fs.writeFileSync('session_b64.txt', encoded);
                console.log('[SESSION] Encoded → session_b64.txt');
                console.log('\n=== NEXT STEPS ===');
                console.log('1. Go to your GitHub repo → Settings → Secrets → Actions');
                console.log('2. Add secret: WA_SESSION  →  paste contents of session_b64.txt');
                console.log('3. Add secret: GROUP_JID   →  paste contents of .group_jid');
                console.log('4. Push this repo to GitHub');
                console.log('5. GitHub Actions will run Mon-Fri 7 AM automatically\n');
            } catch (e) {
                console.error('Session encode failed:', e.message);
            }

            sock.end();
            process.exit(0);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log('Reconnecting...');
                setup();
            }
        }
    });
}

setup();
