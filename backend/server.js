const http = require('http');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const db    = require('./db');
const perm  = require('./permission');
const brain = require('./nexabrain');

const PORT = 8081;
const AI_API_URL = process.env.NEXA_AI_API_URL || 'http://127.0.0.1:8000';
const AI_TIMEOUT_MS = Number(process.env.NEXA_AI_TIMEOUT_MS || 30000);

// --- Shared routing logic -------------------------------------------------
// Used by both the HTTP /rpc endpoint and the WebSocket transport so the two
// stay in sync.
async function route(method, params = {}) {
  // 1. Internal storage / permission requests
  if (method === 'db.getBookmarks') {
    return db.getBookmarks();
  }
  if (method === 'permission.request') {
    return perm.request(params && params.scope);
  }

  // 2. AI requests -> forward to the Nexa AI Python API
  if (typeof method === 'string' && method.startsWith('nexabrain.')) {
    console.log(`Forwarding AI request: ${method}`);

    // Map internal method names to Python API endpoints.
    let endpoint = '/generate';
    if (method === 'nexabrain.summarize') endpoint = '/generate';

    const aiResponse = await axios.post(
      `${AI_API_URL}${endpoint}`,
      {
        prompt: (params && params.text) || params,
        system_prompt: 'You are the Sovereign AI of Nexa Browser. Be concise and helpful.'
      },
      { timeout: AI_TIMEOUT_MS }
    );
    return aiResponse.data;
  }

  // 3. Fallback
  if (method === 'ping') {
    return 'pong';
  }

  throw new Error(`Unknown method ${method}`);
}

// --- HTTP server ----------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      // Guard against runaway payloads (1 MB).
      if (data.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, service: 'nexa-backend', port: PORT });
    return;
  }

  if (req.method === 'POST' && req.url === '/rpc') {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      sendJson(res, 413, { error: e.message });
      return;
    }

    let parsed;
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch (e) {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const { id = null, method, params } = parsed;
    try {
      const result = await route(method, params);
      sendJson(res, 200, { id, result });
    } catch (e) {
      console.error('RPC Error:', e.message);
      sendJson(res, 200, { id, error: e.message });
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// --- WebSocket server (shares the same HTTP server / port) ---------------
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  console.log('Client connected to Nexa Backend (AI Gateway)');

  ws.on('message', async message => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (e) {
      ws.send(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { id, method, params } = data || {};
    try {
      const result = await route(method, params);
      ws.send(JSON.stringify({ id, result }));
    } catch (e) {
      console.error('Backend Error:', e.message);
      ws.send(JSON.stringify({ id, error: e.message }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Nexa AI Gateway HTTP  on http://127.0.0.1:${PORT}/rpc`);
  console.log(`Nexa AI Gateway WS    on ws://127.0.0.1:${PORT}`);
  console.log(`Connected to Nexa AI Engine at ${AI_API_URL}`);
});
