const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const KANBOX_API_KEY = process.env.KANBOX_API_KEY || '';
const KANBOX_BASE_URL = 'https://api.kanbox.io';
const PORT = process.env.PORT || 3000;

const TOOLS = [
  {
    name: 'kanbox_get_leads',
    description: 'Get leads/contacts from Kanbox CRM',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (default 1)' },
        limit: { type: 'number', description: 'Results per page (default 20)' },
        search: { type: 'string', description: 'Search query to filter leads' }
      }
    }
  },
  {
    name: 'kanbox_get_lists',
    description: 'Get all lists/segments in Kanbox',
    inputSchema: { type: 'object', properties: { page: { type: 'number' }, limit: { type: 'number' } } }
  },
  {
    name: 'kanbox_get_members',
    description: 'Get team members in Kanbox',
    inputSchema: { type: 'object', properties: { page: { type: 'number' }, limit: { type: 'number' } } }
  },
  {
    name: 'kanbox_get_campaigns',
    description: 'Get campaigns in Kanbox',
    inputSchema: { type: 'object', properties: { page: { type: 'number' }, limit: { type: 'number' } } }
  }
];

async function callKanbox(endpoint, params) {
  const qs = new URLSearchParams(params).toString();
  const url = KANBOX_BASE_URL + endpoint + (qs ? '?' + qs : '');
  const res = await fetch(url, { headers: { 'X-API-Key': KANBOX_API_KEY } });
  return res.json();
}

async function executeTool(name, args) {
  const params = {};
  if (args.page) params.page = args.page;
  if (args.limit) params.limit = args.limit;
  if (args.search) params.search = args.search;
  switch (name) {
    case 'kanbox_get_leads': return callKanbox('/public/leads', params);
    case 'kanbox_get_lists': return callKanbox('/public/lists', params);
    case 'kanbox_get_members': return callKanbox('/public/members', params);
    case 'kanbox_get_campaigns': return callKanbox('/public/campaigns', params);
    default: throw new Error('Unknown tool: ' + name);
  }
}

app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.write('data: ' + JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: { serverInfo: { name: 'kanbox-mcp', version: '1.0.0' }, capabilities: { tools: {} } } }) + '\n\n');
  const t = setInterval(() => res.write(': ping\n\n'), 30000);
  req.on('close', () => clearInterval(t));
});

app.post('/mcp', async (req, res) => {
  const { id, method, params } = req.body;
  try {
    if (method === 'initialize') return res.json({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'kanbox-mcp', version: '1.0.0' }, capabilities: { tools: {} } } });
    if (method === 'tools/list') return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const result = await executeTool(params.name, params.arguments || {});
      return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
    }
    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (err) {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', service: 'kanbox-mcp-proxy', tools: TOOLS.length }));

app.listen(PORT, () => console.log('Kanbox MCP proxy running on port ' + PORT));