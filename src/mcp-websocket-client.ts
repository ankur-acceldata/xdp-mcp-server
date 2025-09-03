/**
 * MCP WebSocket Client for Bolt.diy
 * 
 * This client can be used by Bolt.diy to connect to the MCP server
 * running in Kubernetes via WebSocket.
 */

import WebSocket from 'ws';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPToolResult {
  content?: any;
  error?: string;
  isError?: boolean;
}

export interface MCPClientConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
  authToken?: string;
}

export class MCPWebSocketClient {
  private ws: WebSocket | null = null;
  private config: MCPClientConfig;
  private reconnectAttempts = 0;
  private isConnected = false;
  private pingTimer: NodeJS.Timeout | null = null;
  private messageQueue: Array<{ resolve: Function; reject: Function; message: any }> = [];
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();

  constructor(config: MCPClientConfig) {
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      pingInterval: 30000,
      ...config
    };
  }

  /**
   * Connect to the MCP WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const headers: any = {};
        if (this.config.authToken) {
          headers['Authorization'] = `Bearer ${this.config.authToken}`;
        }

        this.ws = new WebSocket(this.config.url, { headers });

        this.ws.on('open', () => {
          console.log('✅ Connected to MCP WebSocket server');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startPing();
          this.processMessageQueue();
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });

        this.ws.on('close', () => {
          console.log('🔌 WebSocket connection closed');
          this.isConnected = false;
          this.stopPing();
          this.handleReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          if (!this.isConnected) {
            reject(error);
          }
        });

        this.ws.on('pong', () => {
          // Keep-alive received
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the MCP server
   */
  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPTool[]> {
    const response = await this.sendRequest('tools/list', {});
    return response.tools || [];
  }

  /**
   * Execute a tool on the MCP server
   */
  async executeTool(toolName: string, params: any): Promise<MCPToolResult> {
    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: params
    });
    return response;
  }

  /**
   * Execute a custom query via HTTP fallback
   */
  async executeCustomQuery(endpoint: string, params: any): Promise<any> {
    // This can be used as a fallback to HTTP if WebSocket fails
    const baseUrl = this.config.url.replace('ws://', 'http://').replace('wss://', 'https://');
    const apiUrl = baseUrl.replace('/ws', '');
    
    const response = await fetch(`${apiUrl}/api${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.authToken ? { 'Authorization': `Bearer ${this.config.authToken}` } : {})
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Send a JSON-RPC request
   */
  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws) {
        // Queue the message if not connected
        this.messageQueue.push({ resolve, reject, message: { method, params } });
        this.handleReconnect();
        return;
      }

      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });

      try {
        this.ws.send(JSON.stringify(request));
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: any): void {
    // Handle JSON-RPC responses
    if (message.jsonrpc === '2.0' && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || 'Unknown error'));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Handle other message types
    switch (message.type) {
      case 'connection':
        console.log(`Connected with session ID: ${message.sessionId}`);
        break;
      case 'pong':
        // Pong received
        break;
      case 'error':
        console.error('Server error:', message.error);
        break;
      default:
        console.log('Received message:', message);
    }
  }

  /**
   * Start ping timer
   */
  private startPing(): void {
    if (this.config.pingInterval) {
      this.pingTimer = setInterval(() => {
        if (this.ws && this.isConnected) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, this.config.pingInterval);
    }
  }

  /**
   * Stop ping timer
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Handle reconnection
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 10)) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, this.config.reconnectInterval);
  }

  /**
   * Process queued messages after reconnection
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const { resolve, reject, message } = this.messageQueue.shift()!;
      this.sendRequest(message.method, message.params)
        .then((result) => resolve(result))
        .catch((error) => reject(error));
    }
  }

  /**
   * Check if client is connected
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get WebSocket ready state
   */
  getReadyState(): number {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED;
  }
}

// Export for use in Bolt.diy
export default MCPWebSocketClient;