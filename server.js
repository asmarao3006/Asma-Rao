require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, `PORT=4000\nNODE_ENV=development\nALLOWED_ORIGIN=*\n`);
}

const app = express();
const DEFAULT_PORT = parseInt(process.env.PORT || '4000', 10);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.static(path.join(__dirname, 'public')));

// 4MB High-Throughput Buffer
const CHUNK_SIZE = 4 * 1024 * 1024;
const STREAM_BUFFER = crypto.randomBytes(CHUNK_SIZE);

// 1. Ultra-Low Overhead Ping Endpoint
app.get('/api/ping', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.json({ ok: 1, ts: Date.now() });
});

// 2. High-Throughput Multi-Stream Download
app.get('/api/download', (req, res) => {
  const sizeMB = Math.min(Math.max(parseInt(req.query.size || '50', 10), 5), 500);
  const totalBytes = sizeMB * 1024 * 1024;

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', totalBytes);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  let sent = 0;
  function writeData() {
    while (sent < totalBytes) {
      const remaining = totalBytes - sent;
      const currentChunk = remaining < CHUNK_SIZE ? STREAM_BUFFER.subarray(0, remaining) : STREAM_BUFFER;
      sent += currentChunk.length;

      const ok = res.write(currentChunk);
      if (!ok) {
        res.once('drain', writeData);
        return;
      }
    }
    res.end();
  }
  writeData();
});

// 3. Upload Sink (Memory-Safe Streaming Sink)
app.post('/api/upload', (req, res) => {
  let bytesReceived = 0;
  const start = Date.now();
  req.on('data', chunk => { bytesReceived += chunk.length; });
  req.on('end', () => {
    const duration = (Date.now() - start) / 1000 || 0.001;
    res.json({
      bytesReceived,
      durationSec: duration,
      mbps: parseFloat(((bytesReceived * 8) / (1024 * 1024) / duration).toFixed(2))
    });
  });
  req.on('error', () => res.status(500).end());
});

// 4. Free Network Intelligence (Zero API Keys Required)
app.get('/api/network-details', async (req, res) => {
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.substring(7);

  const isLocal = ip === '127.0.0.1' || ip === '::1' || !ip;
  let networkInfo = {
    client_ip: ip || '127.0.0.1',
    provider: 'Local Network',
    location: 'Local Gateway',
    connection_type: 'Fiber / WiFi Broadband'
  };

  try {
    const targetIp = isLocal ? '' : ip;
    const response = await fetch(`https://ipapi.co/${targetIp ? targetIp + '/' : ''}json/`);
    if (response.ok) {
      const data = await response.json();
      networkInfo = {
        client_ip: data.ip || ip,
        provider: data.org || data.asn || 'Broadband ISP',
        location: `${data.city || ''}, ${data.country_name || ''}`,
        connection_type: 'Fiber / High-Speed WiFi'
      };
    }
  } catch (e) {}

  res.json({ status: 'success', ...networkInfo });
});

// Auto-Healing Dynamic Port Allocation (Prevents EADDRINUSE crash)
function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    console.log(`================================================================`);
    console.log(` ⚡ WiFi Speed Tester Server is LIVE!`);
    console.log(` 🔗 URL  : http://localhost:${portToTry}`);
    console.log(` 🚀 Mode : 100% Free Intelligence (No API Keys Needed)`);
    console.log(`================================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Port Conflict] Port ${portToTry} is busy. Auto-switching to port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(DEFAULT_PORT);
