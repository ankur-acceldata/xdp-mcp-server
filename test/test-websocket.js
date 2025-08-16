#!/usr/bin/env node

/**
 * WebSocket Test Client for XDP MCP Server
 * 
 * Tests WebSocket connectivity and MCP protocol implementation
 */

import WebSocket from 'ws';
import readline from 'readline';

const SERVER_URL = process.env.MCP_SERVER_URL || 'ws://localhost:8080/ws';

class WebSocketTester {
  constructor() {
    this.ws = null;
    this.requestId = 0;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`🔌 Connecting to ${SERVER_URL}...`);
      
      this.ws = new WebSocket(SERVER_URL);

      this.ws.on('open', () => {
        console.log('✅ Connected to MCP WebSocket server');
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('\n📨 Received:', JSON.stringify(message, null, 2));
      });

      this.ws.on('close', () => {
        console.log('🔌 Connection closed');
        process.exit(0);
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });
    });
  }

  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('\n📤 Sending:', JSON.stringify(message, null, 2));
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('❌ WebSocket is not connected');
    }
  }

  // Test basic connectivity
  testPing() {
    this.sendMessage({ type: 'ping' });
  }

  // Test listing tools via custom protocol
  testListTools() {
    this.sendMessage({ type: 'list_tools' });
  }

  // Test listing tools via JSON-RPC (MCP protocol)
  testMCPListTools() {
    this.sendMessage({
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/list',
      params: {}
    });
  }

  // Test executing a tool via JSON-RPC
  testMCPExecuteTool(toolName, params) {
    this.sendMessage({
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    });
  }

  // Test XDP list datastores
  testListDatastores() {
    this.testMCPExecuteTool('xdp_list_datastores', {
      page: 0,
      size: 5,
      sortBy: 'updatedAt:desc'
    });
  }

  // Interactive menu
  async runInteractive() {
    console.log('\n🎮 XDP MCP WebSocket Test Client');
    console.log('================================\n');
    
    const showMenu = () => {
      console.log('\nAvailable commands:');
      console.log('1. ping              - Test basic connectivity');
      console.log('2. list-tools        - List available MCP tools');
      console.log('3. list-datastores   - List XDP datastores');
      console.log('4. list-catalogs     - List Trino catalogs');
      console.log('5. custom            - Send custom JSON message');
      console.log('6. exit              - Close connection and exit');
      console.log('');
    };

    showMenu();

    this.rl.on('line', (input) => {
      const command = input.trim().toLowerCase();

      switch (command) {
        case '1':
        case 'ping':
          this.testPing();
          break;

        case '2':
        case 'list-tools':
          this.testMCPListTools();
          break;

        case '3':
        case 'list-datastores':
          this.testListDatastores();
          break;

        case '4':
        case 'list-catalogs':
          this.rl.question('Enter dataplane ID: ', (dataplane) => {
            this.testMCPExecuteTool('trino_list_catalogs', { dataplane });
          });
          break;

        case '5':
        case 'custom':
          this.rl.question('Enter JSON message: ', (json) => {
            try {
              const message = JSON.parse(json);
              this.sendMessage(message);
            } catch (error) {
              console.error('❌ Invalid JSON:', error.message);
            }
          });
          break;

        case '6':
        case 'exit':
          console.log('👋 Closing connection...');
          this.ws.close();
          this.rl.close();
          process.exit(0);

        default:
          console.log('❓ Unknown command:', command);
          showMenu();
      }
    });
  }

  // Automated test suite
  async runAutomatedTests() {
    console.log('\n🤖 Running automated tests...\n');

    const tests = [
      { name: 'Ping Test', fn: () => this.testPing() },
      { name: 'List Tools', fn: () => this.testMCPListTools() },
      { name: 'List Datastores', fn: () => this.testListDatastores() },
    ];

    for (const test of tests) {
      console.log(`\n📋 Running: ${test.name}`);
      test.fn();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n✅ Automated tests completed');
  }
}

// Main execution
async function main() {
  const tester = new WebSocketTester();

  try {
    await tester.connect();

    const mode = process.argv[2];
    
    if (mode === '--auto') {
      await tester.runAutomatedTests();
      setTimeout(() => {
        tester.ws.close();
        process.exit(0);
      }, 5000);
    } else {
      await tester.runInteractive();
    }
  } catch (error) {
    console.error('❌ Failed to connect:', error);
    process.exit(1);
  }
}

main();