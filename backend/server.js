const { WebSocketServer } = require('ws');
const axios = require('axios');
const db       = require('./db');
const perm     = require('./permission');
const brain    = require('./nexabrain');

const PORT = 8081; 
const AI_API_URL = 'http://127.0.0.1:8000'; // The Nexa AI Python API

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', ws => {
  console.log('Client connected to Nexa Backend (AI Gateway)');
  
  ws.on('message', async message => {
    try {
      const data = JSON.parse(message.toString());
      const {id, method, params} = data;
      let result;
      
      // --- ROUTING LOGIC ---
      
      // 1. Internal Storage/Permission requests
      if (method === 'db.getBookmarks') {
        result = db.getBookmarks();
      } else if (method === 'permission.request') {
        result = perm.request(params.scope);
      } 
      
      // 2. AI Requests -> Forward to Nexa AI Python API
      else if (method.startsWith('nexabrain.')) {
        console.log(`Forwarding AI request: ${method}`);
        
        // Map internal method names to the Python API endpoints
        let endpoint = '/generate'; 
        if (method === 'nexabrain.summarize') endpoint = '/generate';
        
        const aiResponse = await axios.post(`${AI_API_URL}${endpoint}`, {
            prompt: params.text || params,
            system_prompt: "You are the Sovereign AI of Nexa Browser. Be concise and helpful."
        });
        
        result = aiResponse.data;
      } 
      
      // 3. Fallback
      else if (method === 'ping') {
        result = 'pong';
      } else {
        throw new Error(`Unknown method ${method}`);
      }
      
      ws.send(JSON.stringify({id, result}));
    } catch (e) {
      console.error("Backend Error:", e.message);
      ws.send(JSON.stringify({id, error: e.message}));
    }
  });
});

console.log(`Nexa AI Gateway running on ws://127.0.0.1:${PORT}`);
console.log(`Connected to Nexa AI Engine at ${AI_API_URL}`);
