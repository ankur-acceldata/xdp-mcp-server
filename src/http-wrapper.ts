import express from 'express';
import { spawn } from 'child_process';
import { XDPMCPServer } from './index.js';

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// MCP tool execution endpoint
app.post('/execute-tool', async (req, res) => {
  try {
    const { toolName, arguments: toolArgs } = req.body;
    
    // Spawn MCP server process
    const mcpProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Send MCP request
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs
      }
    };
    
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    mcpProcess.stdin.end();
    
    let response = '';
    mcpProcess.stdout.on('data', (data) => {
      response += data.toString();
    });
    
    mcpProcess.on('close', (code) => {
      try {
        const result = JSON.parse(response);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Invalid MCP response', raw: response });
      }
    });
    
    mcpProcess.on('error', (error) => {
      res.status(500).json({ error: error.message });
    });
    
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const PORT = parseInt(process.env.HTTP_PORT || '3000');
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP wrapper running on port ${PORT}`);
});