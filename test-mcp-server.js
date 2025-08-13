#!/usr/bin/env node

/**
 * Test script for XDP MCP Server
 * 
 * This script communicates with the MCP server using JSON-RPC over stdio
 * to verify it's working correctly.
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

console.log('🧪 Testing XDP MCP Server...\n');

// Start the MCP server
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    XDP_ACCESS_KEY: 'ZUDOSEQZQEKQCTJ',
    XDP_SECRET_KEY: 'TY2C51SAU3CHUALOVDY4JEOYGFCSM0'
  }
});

let responseCount = 0;

// Handle server errors
server.stderr.on('data', (data) => {
  const output = data.toString();
  if (output.includes('✅') || output.includes('🚀') || output.includes('📊')) {
    console.log('Server:', output.trim());
  }
});

// Handle server responses
server.stdout.on('data', (data) => {
  try {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        const response = JSON.parse(line);
        responseCount++;
        
        console.log(`\n📥 Response ${responseCount}:`);
        console.log(JSON.stringify(response, null, 2));
        
        // Check if this is the tool call response
        if (response.result && response.result.content) {
          console.log('\n📋 Tool Response Content:');
          console.log(response.result.content[0].text);
        }
      }
    });
  } catch (e) {
    console.log('Raw output:', data.toString());
  }
});

// Send test requests after server starts up
async function runTests() {
  // Wait for server to initialize
  await setTimeout(2000);
  
  console.log('📤 Sending test requests...\n');

  // Test 1: List available tools
  console.log('1️⃣ Testing tools/list...');
  const listToolsRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  };
  
  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
  
  // Wait between requests
  await setTimeout(2000);
  
  // Test 2: Call the datastore tool
  console.log('2️⃣ Testing xdp_list_datastores tool...');
  const callToolRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "xdp_list_datastores",
      arguments: {
        page: 0,
        size: 3,
        sortBy: "updatedAt:desc"
      }
    }
  };
  
  server.stdin.write(JSON.stringify(callToolRequest) + '\n');
  
  // Wait for responses then cleanup
  await setTimeout(5000);
  
  console.log('\n✅ Test completed! Check the responses above.');
  console.log('\nIf you see tool responses with XDP data, the server is working correctly.');
  
  server.kill();
  process.exit(0);
}

// Handle process cleanup
process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});

// Start tests
runTests().catch(error => {
  console.error('❌ Test failed:', error);
  server.kill();
  process.exit(1);
});