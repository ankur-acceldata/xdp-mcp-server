#!/usr/bin/env node

/**
 * Simple MCP Server Test
 * 
 * Shows the exact JSON-RPC requests and responses
 */

import { spawn } from 'child_process';

console.log('🔌 Testing MCP Server JSON-RPC Communication\n');

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    XDP_ACCESS_KEY: 'ZUDOSEQZQEKQCTJ',
    XDP_SECRET_KEY: 'TY2C51SAU3CHUALOVDY4JEOYGFCSM0'
  }
});

// Test requests to send
const requests = [
  {
    name: "Initialize",
    request: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: "test-client",
          version: "1.0.0"
        }
      }
    }
  },
  {
    name: "List Tools",
    request: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    }
  },
  {
    name: "Call XDP Tool",
    request: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "xdp_list_datastores",
        arguments: {
          page: 0,
          size: 2
        }
      }
    }
  }
];

let currentRequest = 0;

// Handle responses
server.stdout.on('data', (data) => {
  const response = data.toString().trim();
  if (response) {
    try {
      const parsed = JSON.parse(response);
      console.log(`✅ Response ${parsed.id}:`, JSON.stringify(parsed, null, 2));
      console.log('');
    } catch (e) {
      console.log('Raw:', response);
    }
  }
});

// Send requests with delays
function sendNextRequest() {
  if (currentRequest < requests.length) {
    const { name, request } = requests[currentRequest];
    console.log(`📤 ${name} Request:`);
    console.log(JSON.stringify(request, null, 2));
    console.log('');
    
    server.stdin.write(JSON.stringify(request) + '\n');
    currentRequest++;
    
    setTimeout(sendNextRequest, 3000);
  } else {
    setTimeout(() => {
      console.log('🎉 All tests completed!');
      server.kill();
      process.exit(0);
    }, 2000);
  }
}

// Start after server initializes
setTimeout(sendNextRequest, 2000);

// Cleanup
process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});