const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

let sock;
let qrCodeData = '';
let isConnected = false;

// Estado de autenticação
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrCodeData = await QRCode.toDataURL(qr);
      console.log('QR Code gerado!');
    }
    
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Reconectando...', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
      isConnected = false;
    } else if (connection === 'open') {
      console.log('WhatsApp conectado!');
      isConnected = true;
      qrCodeData = '';
    }
  });

  // Escutar mensagens recebidas
  sock.ev.on('messages.upsert', async (m) => {
    const message = m.messages[0];
    if (!message.key.fromMe && m.type === 'notify') {
      console.log('Nova mensagem:', {
        from: message.key.remoteJid,
        text: message.message?.conversation || message.message?.extendedTextMessage?.text,
        timestamp: new Date()
      });
      
      // Aqui você pode adicionar webhook para N8n
      // await sendToN8n(messageData);
    }
  });
}

// Rotas da API
app.get('/', (req, res) => {
  res.json({ 
    status: 'API WhatsApp funcionando!',
    connected: isConnected 
  });
});

app.get('/qr', (req, res) => {
  if (qrCodeData) {
    res.json({ qr: qrCodeData });
  } else if (isConnected) {
    res.json({ message: 'WhatsApp já conectado!' });
  } else {
    res.json({ message: 'Aguardando QR Code...' });
  }
});

app.get('/status', (req, res) => {
  res.json({ connected: isConnected });
});

app.post('/send-message', async (req, res) => {
  try {
    const { number, message } = req.body;
    
    if (!isConnected) {
      return res.status(400).json({ error: 'WhatsApp não conectado' });
    }
    
    const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    
    res.json({ success: true, message: 'Mensagem enviada!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
  connectToWhatsApp();
});
