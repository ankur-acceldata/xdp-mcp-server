#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'xdp-mcp-http-bridge' });
});

// List available tools
app.get('/tools', async (req, res) => {
  try {
    const result = await executeMCPRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {}
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Execute MCP tool
app.post('/tools/execute', async (req, res) => {
  try {
    const { toolName, arguments: toolArgs } = req.body;
    
    if (!toolName) {
      return res.status(400).json({ error: 'toolName is required' });
    }
    
    const result = await executeMCPRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs || {}
      }
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// List datastores endpoint (direct)
app.get('/datastores', async (req, res) => {
  try {
    const { page = 0, size = 10, sortBy = 'updatedAt:desc' } = req.query;
    
    const result = await executeMCPRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'list-datastores',
        arguments: {
          page: Number(page),
          size: Number(size),
          sort_by: sortBy as string
        }
      }
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Execute Trino query
app.post('/trino/execute', async (req, res) => {
  try {
    const { datastore_id, query, limit = 100 } = req.body;
    
    if (!datastore_id || !query) {
      return res.status(400).json({ error: 'datastore_id and query are required' });
    }
    
    const result = await executeMCPRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'trino-execute',
        arguments: {
          datastore_id,
          query,
          limit
        }
      }
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Function to execute MCP request
function executeMCPRequest(request: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const mcpPath = join(__dirname, 'index.js');
    
    const mcpProcess = spawn('node', [mcpPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'production'
      }
    });
    
    let stdout = '';
    let stderr = '';
    let responseReceived = false;
    
    mcpProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      
      // Try to parse JSON-RPC response
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.trim() && line.includes('"jsonrpc"')) {
          try {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              responseReceived = true;
              resolve(response.result || response);
            }
          } catch (e) {
            // Not a complete JSON yet, continue
          }
        }
      }
    });
    
    mcpProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('MCP stderr:', data.toString());
    });
    
    mcpProcess.on('close', (code) => {
      if (!responseReceived) {
        if (code !== 0) {
          reject(new Error(`MCP process exited with code ${code}: ${stderr}`));
        } else {
          // Try to extract result from stdout
          try {
            const lines = stdout.split('\n');
            for (const line of lines) {
              if (line.trim() && line.includes('"result"')) {
                const response = JSON.parse(line);
                resolve(response.result || response);
                return;
              }
            }
            resolve({ stdout, stderr });
          } catch (e) {
            reject(new Error(`Failed to parse MCP response: ${stdout}`));
          }
        }
      }
    });
    
    mcpProcess.on('error', (error) => {
      reject(error);
    });
    
    // Send the request
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    mcpProcess.stdin.end();
  });
}

const PORT = process.env.HTTP_PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT as number, HOST, () => {
  console.log(`🚀 XDP MCP HTTP Bridge running on http://${HOST}:${PORT}`);
  console.log('📊 Available endpoints:');
  console.log('  GET  /health');
  console.log('  GET  /tools');
  console.log('  POST /tools/execute');
  console.log('  GET  /datastores');
  console.log('  POST /trino/execute');
});