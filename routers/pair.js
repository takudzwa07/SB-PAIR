const { 
    giftedId,
    removeFile
} = require('../lib'); 

const express = require('express');
const fs = require('fs'); 
const axios = require('axios');
require('dotenv').config();
const path = require('path');
let router = express.Router();
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

            let Gifted = Gifted_Tech({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari")
            });

            if (!Gifted.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await Gifted.requestPairingCode(num);
                console.log(`Your Code: ${code}`);

                if (!res.headersSent) {
                    res.send({ code });
                }
            }

            Gifted.ev.on('creds.update', saveCreds);
            
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(5000);
                    
                    try {
                        const sessionId = await uploadCreds(id);
                        if (!sessionId) {
                            throw new Error('Failed to upload credentials');
                        }

                        // Send SESSION_ID
                        const session = await Gifted.sendMessage(Gifted.user.id, { text: sessionId });

                        // Send success image + message
                        await Gifted.sendMessage(Gifted.user.id, {
                            image: { url: 'https://files.catbox.moe/sxseo0.jpg' },
                            caption: `🎉 *Welcome to SUBZERO-BOT!* 🚀  

🔒 *Your Session ID* is ready!  ⚠️ _Keep it private and secure — dont share it with anyone._

_Please Check Whether Its works or not here before deploying_

https://subzero-auth.koyeb.app/validate

🔑 *Copy & Paste the SESSION_ID Above*🛠️ Add it to your environment variable: *SESSION_ID*.  

💡 *Whats Next?* 
1️⃣ Explore all the cool features of Subzero MD.
2️⃣ Stay updated with our latest releases and support.
3️⃣ Enjoy seamless WhatsApp automation! 🤖  

🔗 *Join Our Support Channel:* 👉 [Click Here to Join] https://whatsapp.com/channel/0029VagQEmB002T7MWo3Sj1D

⭐ *Show Some Love!* Give us a ⭐ on GitHub and support the development: 👉 [Please Follow Me Here ] https://github.com/mrfr8nk  

> _Thanks for choosing SUBZERO-BOT — Let the automation begin!_ ✨`,
                        }, { quoted: session });

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

                    } catch (err) {
                        console.error('Error in connection update:', err);
                    } finally {
                        await delay(100);
                        await Gifted.ws.close();
                        removeFile(authDir).catch(err => console.error('Error removing temp files:', err));
                    }
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    await delay(10000);
                    GIFTED_PAIR_CODE().catch(err => console.error('Error restarting pairing:', err));
                }
            });
        } catch (err) {
            console.error("Service Error:", err);
            removeFile(authDir).catch(err => console.error('Error cleaning up:', err));

            if (!res.headersSent) {
                res.status(500).send({ error: "Service is Currently Unavailable" });
            }
        }
    }

    await GIFTED_PAIR_CODE();
});

module.exports = router;
