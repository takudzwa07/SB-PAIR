const {
    giftedId,
    removeFile
} = require('../lib');

const express = require('express');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();
const path = require('path');
const router = express.Router();
const pino = require("pino");

const SESSIONS_API_URL = 'https://subzero-md.koyeb.app';
const SESSIONS_API_KEY = 'subzero-md';

const {
    default: Gifted_Tech,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

async function uploadCreds(id) {
    try {
        const authPath = path.join(__dirname, 'temp', id, 'creds.json');

        if (!fs.existsSync(authPath)) {
            console.error('Creds file not found at:', authPath);
            return null;
        }

        const credsData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
        const credsId = giftedId();

        const response = await axios.post(
            `${SESSIONS_API_URL}/api/uploadCreds.php`,
            { credsId, credsData },
            {
                headers: {
                    'x-api-key': SESSIONS_API_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );
        return credsId;
    } catch (error) {
        console.error('Error uploading credentials:', error.response?.data || error.message);
        return null;
    }
}

router.get('/', async (req, res) => {
    const id = giftedId();
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({ error: "Phone number is required" });
    }

    async function GIFTED_PAIR_CODE() {
        const authDir = path.join(__dirname, 'temp', id);

        try {
            if (!fs.existsSync(authDir)) {
                fs.mkdirSync(authDir, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(authDir);

            const Gifted = Gifted_Tech({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari")
            });

            // Pairing code logic
            if (!Gifted.authState.creds.registered) {
                await delay(1500);
                const cleanNumber = num.replace(/[^0-9]/g, '');
                const customCode = "MRFRANKX"; // must be 8 characters
                const code = await Gifted.requestPairingCode(cleanNumber, customCode);

                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`Pairing code: ${formattedCode}`);

                if (!res.headersSent) {
                    return res.send({ code: formattedCode });
                }
            }

            Gifted.ev.on('creds.update', saveCreds);

            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(5000);

                    try {
                        const sessionId = await uploadCreds(id);
                        if (!sessionId) throw new Error('Failed to upload credentials');

                        const session = await Gifted.sendMessage(Gifted.user.id, { text: sessionId });

                        await Gifted.sendMessage(Gifted.user.id, {
                            image: { url: 'https://files.catbox.moe/sxseo0.jpg' },
                            caption: `🎉 *Welcome to SUBZERO-BOT!* 🚀

🔒 *Your Session ID* is ready! ⚠️ _Keep it private and secure._

Validate it here: https://subzero-auth.koyeb.app/validate

🔑 Add *SESSION_ID* to your environment variable.

💡 Explore Subzero MD Features
👉 [Support] https://whatsapp.com/channel/0029VagQEmB002T7MWo3Sj1D
⭐ GitHub: https://github.com/mrfr8nk`,
                        }, { quoted: session });

                        // Attempt to auto-join group
                        try {
                            await Gifted.groupAcceptInvite("C71TYAGBxak4PkTUDq8puy");
                        } catch (error) {
                            const err = error.message.toLowerCase();
                            if (err.includes("already") || err.includes("participant")) {
                                console.log("Already in group.");
                            } else if (err.includes("privacy")) {
                                await Gifted.sendMessage(Gifted.user.id, {
                                    text: "We couldn't add you due to your privacy settings. Join manually: https://chat.whatsapp.com/C71TYAGBxak4PkTUDq8puy"
                                });
                            } else {
                                console.error("Group join error:", error);
                            }
                        }

                    } catch (err) {
                        console.error('Connection error:', err);
                    } finally {
                        await delay(100);
                        await Gifted.ws.close();
                        removeFile(authDir).catch(err => console.error('Cleanup error:', err));
                    }
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    await delay(10000);
                    GIFTED_PAIR_CODE().catch(err => console.error('Retry error:', err));
                }
            });

        } catch (err) {
            console.error("Service Error:", err);
            removeFile(authDir).catch(err => console.error('Cleanup error:', err));

            if (!res.headersSent) {
                res.status(500).send({ error: "Service Currently Unavailable" });
            }
        }
    }

    await GIFTED_PAIR_CODE();
});

module.exports = router;
