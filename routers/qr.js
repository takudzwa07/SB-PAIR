const {
    default: Gifted_Tech,
    useMultiFileAuthState,
    Browsers,
    delay,
    jidNormalizedUser,
    DisconnectReason,
    makeInMemoryStore
} = require("@whiskeysockets/baileys");

const { giftedId, removeFile } = require('../lib');
const express = require("express");
const router = express.Router();
const pino = require("pino");
const { toBuffer } = require("qrcode");
const path = require('path');
require('dotenv').config();
const fs = require('fs').promises;
const fsSync = require('fs');
const NodeCache = require('node-cache');
const { Boom } = require("@hapi/boom");
const axios = require('axios');

const SESSIONS_API_URL = process.env.SESSIONS_API_URL || 'https://subzero-md.koyeb.app';
const SESSIONS_API_KEY = process.env.SESSIONS_API_KEY || 'subzero-md';

async function uploadCreds(id) {
    try {
        const authPath = path.join(__dirname, 'temp', id, 'creds.json');
        try {
            await fs.access(authPath);
        } catch {
            console.error('Creds file not found at:', authPath);
            return null;
        }

        const credsData = JSON.parse(await fs.readFile(authPath, 'utf8'));
        const credsId = giftedId();

        await axios.post(
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

router.get("/", async (req, res) => {
    const id = giftedId();
    const authDir = path.join(__dirname, 'temp', id);

    try {
        try {
            await fs.access(authDir);
        } catch {
            await fs.mkdir(authDir, { recursive: true });
        }

        async function GIFTED_QR_CODE() {
            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            const msgRetryCounterCache = new NodeCache();

            try {
                let Gifted = Gifted_Tech({
                    printQRInTerminal: false,
                    logger: pino({ level: "silent" }),
                    browser: Browsers.baileys("Desktop"),
                    auth: state,
                    msgRetryCounterCache,
                    defaultQueryTimeoutMs: undefined
                });

                Gifted.ev.on("connection.update", async (update) => {
                    const { connection, lastDisconnect, qr } = update;

                    // Send QR image to client
                    if (qr) {
                        try {
                            const qrBuffer = await toBuffer(qr);
                            if (!res.headersSent) {
                                res.type('png').send(qrBuffer);
                            }
                        } catch (qrError) {
                            console.error('QR render error:', qrError);
                            if (!res.headersSent) {
                                res.status(500).send("QR generation failed");
                            }
                        }
                    }

                    if (connection === "open") {
                        try {
                            await delay(3000);
                            const sessionId = await uploadCreds(id);
                            if (!sessionId) {
                                throw new Error('Failed to upload credentials');
                            }

                            // Send the session ID
                            const session = await Gifted.sendMessage(Gifted.user.id, { text: sessionId });

                            // Send welcome message
                            const GIFTED_TEXT = `\`Qr Scan Succcess!\`
🎉 *Welcome to SUBZERO-BOT!* 🚀  

🔒 *Your Session ID* is ready!  ⚠️ _Keep it private and secure — don't share it with anyone._ 

🔑 *Copy & Paste the SESSION_ID Above*🛠️ Add it to your environment variable: *SESSION_ID*.  

💡 *Whats Next?* 
1️⃣ Explore all the cool features of Subzero MD.
2️⃣ Stay updated with our latest releases and support.
3️⃣ Enjoy seamless WhatsApp automation! 🤖  

🔗 *Join Our Support Channel:* 👉 [Click Here to Join](https://whatsapp.com/channel/0029VagQEmB002T7MWo3Sj1D) 

⭐ *Show Some Love!* Give us a ⭐ on GitHub and support the development: 👉 [Please Follow Me Here](https://github.com/mrfr8nk/)  

> _Thanks for choosing SUBZERO-BOT — Let the automation begin!_ ✨.`;

                            await Gifted.sendMessage(Gifted.user.id, { text: GIFTED_TEXT }, { quoted: session });

                            // Autojoin group logic: try to accept invite; if already in group, skip; if privacy prevents autojoin, send invite link.
                            try {
                                await Gifted.groupAcceptInvite("C71TYAGBxak4PkTUDq8puy");
                            } catch (error) {
                                const errMsg = error.message.toLowerCase();
                                if (errMsg.includes("already") || errMsg.includes("participant")) {
                                    console.log("User already in group, skipping join.");
                                } else if (errMsg.includes("privacy")) {
                                    await Gifted.sendMessage(Gifted.user.id, {
                                        text: "We couldn’t add you automatically due to your privacy settings. Please join the group using this link: https://chat.whatsapp.com/C71TYAGBxak4PkTUDq8puy"
                                    });
                                } else {
                                    console.error("Group join failed:", error);
                                }
                            }

                            // Close and cleanup
                            await delay(1000);
                            await Gifted.ws.close();
                            await removeFile(authDir);

                        } catch (error) {
                            console.error('Session processing failed:', error);

                            // Notify user of failure
                            try {
                                await Gifted.sendMessage(Gifted.user.id, {
                                    text: '⚠️ Session upload failed. Please try again.'
                                });
                            } catch (msgError) {
                                console.error('Failed to send error message:', msgError);
                            }

                            // Cleanup
                            try {
                                await Gifted.ws.close();
                                await removeFile(authDir);
                            } catch (cleanupError) {
                                console.error('Cleanup failed:', cleanupError);
                            }
                        }
                    }

                    if (connection === "close") {
                        const statusCode = new Boom(lastDisconnect?.error)?.output.statusCode;
                        if (statusCode === DisconnectReason.restartRequired) {
                            await delay(2000);
                            GIFTED_QR_CODE().catch(err => console.error('Restart failed:', err));
                        }
                    }
                });

                Gifted.ev.on('creds.update', saveCreds);

            } catch (error) {
                console.error("Initialization error:", error);
                try {
                    await removeFile(authDir);
                } catch (cleanupError) {
                    console.error('Initial cleanup failed:', cleanupError);
                }
                if (!res.headersSent) {
                    res.status(500).send("Initialization failed");
                }
            }
        }

        await GIFTED_QR_CODE();

    } catch (error) {
        console.error("Fatal error:", error);
        try {
            await removeFile(authDir);
        } catch (finalCleanupError) {
            console.error('Final cleanup failed:', finalCleanupError);
        }
        if (!res.headersSent) {
            res.status(500).send("Service unavailable");
        }
    }
});

module.exports = router;
