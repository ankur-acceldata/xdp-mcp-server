/**
 * WebSocket Server for XDP MCP
 * 
 * Provides WebSocket and HTTP endpoints for the MCP server to enable
 * communication in Kubernetes environments where stdio is not available.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Define JSON-RPC types locally for WebSocket communication
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
import { XDPApiClient } from './services/xdp-api-client.js';
import type { ListDataStoresParams, TrinoExecuteParams } from './types/xdp-types.js';

interface SessionData {
  id: string;
  ws: WebSocket;
  lastActivity: Date;
  mcpServer?: Server;
}

export class XDPWebSocketServer {
  private app: express.Application;
  private httpServer: any;
  private wss: WebSocketServer;
  private sessions: Map<string, SessionData> = new Map();
  private xdpClient: XDPApiClient;
  private port: number;

  constructor(port: number = 8080) {
    this.port = port;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      path: '/ws'
    });

    // Initialize XDP client
    try {
      this.xdpClient = new XDPApiClient();
      console.log('✅ XDP API client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize XDP API client:', error);
      process.exit(1);
    }

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.startSessionCleanup();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        sessions: this.sessions.size
      });
    });

    // Readiness check endpoint
    this.app.get('/ready', async (req, res) => {
      try {
        const isReady = await this.xdpClient.testConnection();
        if (isReady) {
          res.json({ 
            status: 'ready',
            xdp: 'connected'
          });
        } else {
          res.status(503).json({ 
            status: 'not ready',
            xdp: 'disconnected'
          });
        }
      } catch (error) {
        res.status(503).json({ 
          status: 'not ready',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // MCP Streamable HTTP endpoint for Bolt.diy integration
    this.app.post('/api/mcp', async (req, res) => {
      try {
        const { jsonrpc, id, method, params } = req.body;
        
        // Validate JSON-RPC 2.0 format
        if (jsonrpc !== '2.0') {
          return res.status(400).json({
            jsonrpc: '2.0',
            id: id || null,
            error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' }
          });
        }
        
        if (!method) {
          return res.status(400).json({
            jsonrpc: '2.0',
            id: id || null,
            error: { code: -32600, message: 'Invalid Request: method is required' }
          });
        }
        
        // Handle authentication via headers
        const accessKey = req.headers['x-xdp-access-key'] as string;
        const secretKey = req.headers['x-xdp-secret-key'] as string;
        const baseUrl = req.headers['x-xdp-base-url'] as string;

        if (accessKey && secretKey && baseUrl) {
          // Create temporary XDP client with custom credentials
          // For now, we'll use the existing client but this could be enhanced
          console.log('MCP API call with custom credentials');
        }

        let result;
        switch (method) {
          case 'initialize':
            // MCP initialization - return server info and capabilities
            result = {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {},
                prompts: {},
                logging: {}
              },
              serverInfo: {
                name: 'xdp-mcp-server',
                version: '1.0.0'
              }
            };
            break;
          case 'tools/list':
            result = await this.getAvailableTools();
            break;
          case 'tools/call':
            const { name, arguments: args } = params;
            result = await this.executeTool(name, args);
            break;
          default:
            return res.json({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Method not found: ${method}` }
            });
        }

        // Return proper JSON-RPC 2.0 response
        res.json({
          jsonrpc: '2.0',
          id,
          result
        });
      } catch (error) {
        console.error('MCP API error:', error);
        res.json({
          jsonrpc: '2.0',
          id: req.body.id || null,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error'
          }
        });
      }
    });

    // HTTP endpoints for tools (REST API alternative)
    this.app.post('/api/tools/list', async (req, res) => {
      try {
        const tools = await this.getAvailableTools();
        res.json(tools);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    this.app.post('/api/tools/execute', async (req, res) => {
      try {
        const { tool, params } = req.body;
        const result = await this.executeTool(tool, params);
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // XDP-specific endpoints
    this.app.get('/api/xdp/datastores', async (req, res) => {
      try {
        const params: ListDataStoresParams = {
          page: parseInt(req.query.page as string) || 0,
          size: parseInt(req.query.size as string) || 20,
          sortBy: req.query.sortBy as string || 'updatedAt:asc'
        };
        const result = await this.xdpClient.listDataStores(params);
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    this.app.post('/api/trino/query', async (req, res) => {
      try {
        const { dataplane, query } = req.body;
        const result = await this.xdpClient.executeTrinoQuery({ dataplane, query });
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    this.app.get('/api/trino/:dataplane/catalogs', async (req, res) => {
      try {
        const result = await this.xdpClient.listTrinoCatalogs(req.params.dataplane);
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    this.app.get('/api/trino/:dataplane/tables', async (req, res) => {
      try {
        const { catalog, schema } = req.query;
        const result = await this.xdpClient.listTrinoTables(
          req.params.dataplane,
          catalog as string,
          schema as string || ''
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    this.app.get('/api/trino/:dataplane/table', async (req, res) => {
      try {
        const { catalog, schema, table } = req.query;
        const result = await this.xdpClient.getTrinoTableColumns(
          req.params.dataplane,
          catalog as string,
          schema as string,
          table as string
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Session info endpoint
    this.app.get('/api/sessions', (req, res) => {
      const sessionInfo = Array.from(this.sessions.entries()).map(([id, session]) => ({
        id,
        lastActivity: session.lastActivity,
        readyState: session.ws.readyState
      }));
      res.json(sessionInfo);
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const sessionId = this.generateSessionId();
      console.log(`🔌 New WebSocket connection: ${sessionId}`);

      // Create session
      const session: SessionData = {
        id: sessionId,
        ws,
        lastActivity: new Date()
      };
      this.sessions.set(sessionId, session);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        sessionId,
        timestamp: new Date().toISOString()
      }));

      // Handle messages
      ws.on('message', async (data: Buffer) => {
        try {
          session.lastActivity = new Date();
          const message = JSON.parse(data.toString());
          await this.handleWebSocketMessage(session, message);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      });

      // Handle close
      ws.on('close', () => {
        console.log(`🔌 WebSocket disconnected: ${sessionId}`);
        this.sessions.delete(sessionId);
      });

      // Handle error
      ws.on('error', (error) => {
        console.error(`WebSocket error for session ${sessionId}:`, error);
      });

      // Ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    });
  }

  private async handleWebSocketMessage(session: SessionData, message: any) {
    const { ws } = session;

    // Handle JSON-RPC messages for MCP protocol
    if (message.jsonrpc === '2.0') {
      await this.handleMCPMessage(session, message);
      return;
    }

    // Handle custom message types
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;

      case 'list_tools':
        const tools = await this.getAvailableTools();
        ws.send(JSON.stringify({ type: 'tools', data: tools }));
        break;

      case 'execute_tool':
        const result = await this.executeTool(message.tool, message.params);
        ws.send(JSON.stringify({ 
          type: 'tool_result', 
          tool: message.tool,
          data: result 
        }));
        break;

      default:
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: `Unknown message type: ${message.type}` 
        }));
    }
  }

  private async handleMCPMessage(session: SessionData, message: JSONRPCRequest) {
    const { ws } = session;

    try {
      let response: JSONRPCResponse;

      switch (message.method) {
        case 'tools/list':
          const tools = await this.getAvailableTools();
          response = {
            jsonrpc: '2.0',
            id: message.id,
            result: tools
          };
          break;

        case 'tools/call':
          const { name, arguments: args } = message.params as any;
          const result = await this.executeTool(name, args);
          response = {
            jsonrpc: '2.0',
            id: message.id,
            result: result as any
          };
          break;

        default:
          response = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`
            }
          };
      }

      ws.send(JSON.stringify(response));
    } catch (error) {
      const errorResponse: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      };
      ws.send(JSON.stringify(errorResponse));
    }
  }

  private async getAvailableTools() {
    return {
      tools: [
        {
          name: 'xdp_list_datastores',
          description: 'List all data stores from XDP platform with pagination support',
          inputSchema: {
            type: 'object',
            properties: {
              page: { type: 'number', default: 0 },
              size: { type: 'number', default: 20 },
              sortBy: { type: 'string', default: 'updatedAt:asc' }
            }
          }
        },
        {
          name: 'trino_execute_query',
          description: 'Execute a custom Trino SQL query on the specified dataplane',
          inputSchema: {
            type: 'object',
            properties: {
              dataplane: { type: 'string' },
              query: { type: 'string' }
            },
            required: ['dataplane', 'query']
          }
        },
        {
          name: 'trino_list_catalogs',
          description: 'List all available Trino catalogs in the specified dataplane',
          inputSchema: {
            type: 'object',
            properties: {
              dataplane: { type: 'string' }
            },
            required: ['dataplane']
          }
        },
        {
          name: 'trino_list_tables',
          description: 'List tables in a Trino catalog and schema',
          inputSchema: {
            type: 'object',
            properties: {
              dataplane: { type: 'string' },
              catalog: { type: 'string' },
              schema: { type: 'string' }
            },
            required: ['dataplane', 'catalog']
          }
        },
        {
          name: 'trino_describe_table',
          description: 'Get column information for a specific Trino table',
          inputSchema: {
            type: 'object',
            properties: {
              dataplane: { type: 'string' },
              catalog: { type: 'string' },
              schema: { type: 'string' },
              table: { type: 'string' }
            },
            required: ['dataplane', 'catalog', 'schema', 'table']
          }
        }
      ]
    };
  }

  private async executeTool(toolName: string, params: any) {
    console.log(`🔧 Executing tool: ${toolName}`);
    
    switch (toolName) {
      case 'xdp_list_datastores':
        return await this.xdpClient.listDataStores(params);
      
      case 'trino_execute_query':
        return await this.xdpClient.executeTrinoQuery(params);
      
      case 'trino_list_catalogs':
        return await this.xdpClient.listTrinoCatalogs(params.dataplane);
      
      case 'trino_list_tables':
        return await this.xdpClient.listTrinoTables(
          params.dataplane,
          params.catalog,
          params.schema || ''
        );
      
      case 'trino_describe_table':
        return await this.xdpClient.getTrinoTableColumns(
          params.dataplane,
          params.catalog,
          params.schema,
          params.table
        );
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private startSessionCleanup() {
    // Clean up inactive sessions every 5 minutes
    setInterval(() => {
      const now = new Date();
      const timeout = 30 * 60 * 1000; // 30 minutes

      this.sessions.forEach((session, id) => {
        const inactiveTime = now.getTime() - session.lastActivity.getTime();
        if (inactiveTime > timeout) {
          console.log(`🧹 Cleaning up inactive session: ${id}`);
          session.ws.close();
          this.sessions.delete(id);
        }
      });
    }, 5 * 60 * 1000);
  }

  public start() {
    this.httpServer.listen(this.port, () => {
      console.log(`🚀 XDP MCP WebSocket Server running on port ${this.port}`);
      console.log(`📡 WebSocket endpoint: ws://localhost:${this.port}/ws`);
      console.log(`🌐 HTTP API endpoint: http://localhost:${this.port}/api`);
      console.log(`💚 Health check: http://localhost:${this.port}/health`);
      console.log(`✅ Readiness check: http://localhost:${this.port}/ready`);
    });
  }

  public stop() {
    console.log('🛑 Shutting down server...');
    this.wss.close();
    this.httpServer.close();
    this.sessions.forEach(session => session.ws.close());
    this.sessions.clear();
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT || '8080');
  const server = new XDPWebSocketServer(port);
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    server.stop();
    process.exit(0);
  });

  server.start();
}