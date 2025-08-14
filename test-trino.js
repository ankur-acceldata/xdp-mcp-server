#!/usr/bin/env node

/**
 * Test script for Trino MCP tools
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

// Set environment variables for the MCP server
process.env.XDP_ACCESS_KEY = '5KH3SM1D6FUYGMZ';
process.env.XDP_SECRET_KEY = 'T7N34GDRKTWA5ZMDXRODFD1C0W30FR';
process.env.XDP_BASE_URL = 'https://demo.xdp-playground.acceldata.tech/xdp-cp-service/api';

console.log('🔌 Testing Trino MCP Tools\n');

// Start the MCP server as a subprocess
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: process.env
});

// Create readline interface for communication
const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

// Handle server responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('✅ Response:', JSON.stringify(response, null, 2));
  } catch (e) {
    // Not JSON, skip
  }
});

// Send requests to the server
async function sendRequest(request) {
  return new Promise((resolve) => {
    console.log('📤 Request:', JSON.stringify(request, null, 2));
    server.stdin.write(JSON.stringify(request) + '\n');
    
    // Give server time to respond
    setTimeout(resolve, 2000);
  });
}

// Test sequence
async function runTests() {
  // Initialize
  await sendRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  });

  // List tools
  await sendRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  });

  // Test 1: List Trino catalogs
  console.log('\n📚 Test 1: List Trino Catalogs');
  await sendRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'trino_list_catalogs',
      arguments: {
        dataplane: '17'
      }
    }
  });

  // Test 2: List tables in postgres.ad_catalog
  console.log('\n📋 Test 2: List Tables in postgres.ad_catalog');
  await sendRequest({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'trino_list_tables',
      arguments: {
        dataplane: '17',
        catalog: 'postgres',
        schema: 'ad_catalog'
      }
    }
  });

  // Test 3: Describe assets table
  console.log('\n🔍 Test 3: Describe assets table');
  await sendRequest({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'trino_describe_table',
      arguments: {
        dataplane: '17',
        catalog: 'postgres',
        schema: 'ad_catalog',
        table: 'assets'
      }
    }
  });

  // Test 4: Execute custom query
  console.log('\n⚡ Test 4: Execute custom query');
  await sendRequest({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'trino_execute_query',
      arguments: {
        dataplane: '17',
        query: 'SELECT * FROM postgres.ad_catalog.assets LIMIT 5'
      }
    }
  });

  // Clean up
  setTimeout(() => {
    console.log('\n🎉 Tests completed!');
    server.kill();
    process.exit(0);
  }, 3000);
}

// Run tests
runTests().catch(console.error);