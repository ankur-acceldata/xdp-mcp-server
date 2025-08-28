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
import type { ListDataStoresParams, TrinoExecuteParams, ExecuteAndMonitorParams } from './types/xdp-types.js';

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
  private executionTracking: Map<string, { 
    count: number; 
    lastExecution: Date; 
    lastError?: string; 
    hasManualExecution: boolean;
    lastRunId?: string;
  }> = new Map();

  constructor(port: number = 9099) {
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

    // Execute and monitor endpoint
    this.app.post('/api/execute-monitor', async (req, res) => {
      try {
        const result = await this.handleExecuteAndMonitor(req.body as ExecuteAndMonitorParams);
        res.json(result);
      } catch (error) {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Register manual execution endpoint
    this.app.post('/api/register-execution', async (req, res) => {
      try {
        const result = await this.handleRegisterManualExecution(req.body);
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
        },
        {
          name: 'execute_and_monitor',
          description: 'Execute code and monitor logs. First execution must be manual, then auto-retry on errors (max 3 executions per session)',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Unique session ID for tracking execution limits'
              },
              dataplaneId: {
                type: 'string',
                description: 'Dataplane ID where code should be executed'
              },
              jobType: {
                type: 'string',
                description: 'Type of job to execute',
                enum: ['SPARK', 'Python', 'Java'],
                default: 'SPARK'
              },
              description: {
                type: 'string',
                description: 'Optional description for the adhoc run'
              },
              name: {
                type: 'string',
                description: 'Optional name for the adhoc run'
              },
              image: {
                type: 'string',
                description: 'Docker image to use for execution',
                default: 'spark:3.3.0'
              },
              imagePullSecrets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Image pull secrets for private registries',
                default: []
              },
              imagePullPolicy: {
                type: 'string',
                description: 'Image pull policy',
                enum: ['Always', 'IfNotPresent', 'Never'],
                default: 'IfNotPresent'
              },
              codeSourceUrl: {
                type: 'string',
                description: 'URL to the code source (e.g., S3/MinIO URL)',
                default: ''
              },
              stages: {
                type: 'array',
                items: { type: 'string' },
                description: 'Execution stages',
                default: ['main']
              },
              executionType: {
                type: 'string',
                description: 'Execution type',
                enum: ['Python', 'Java'],
                default: 'Python'
              },
              executionMode: {
                type: 'string',
                description: 'Execution mode',
                enum: ['cluster', 'client'],
                default: 'cluster'
              },
              driverCores: {
                type: 'number',
                description: 'Number of CPU cores for driver',
                default: 1,
                minimum: 1
              },
              driverMemory: {
                type: 'string',
                description: 'Memory allocation for driver',
                default: '1g'
              },
              driverMemoryOverhead: {
                type: 'string',
                description: 'Memory overhead for driver',
                default: '512m'
              },
              executorInstances: {
                type: 'number',
                description: 'Number of executor instances',
                default: 2,
                minimum: 1
              },
              executorCores: {
                type: 'number',
                description: 'Number of CPU cores per executor',
                default: 1,
                minimum: 1
              },
              executorMemory: {
                type: 'string',
                description: 'Memory allocation per executor',
                default: '1g'
              },
              executorMemoryOverhead: {
                type: 'string',
                description: 'Memory overhead per executor',
                default: '512m'
              },
              dynamicAllocationEnabled: {
                type: 'boolean',
                description: 'Enable dynamic allocation of executors',
                default: false
              },
              dynamicAllocationInitial: {
                type: 'number',
                description: 'Initial number of executors when dynamic allocation is enabled',
                default: 2
              },
              dynamicAllocationMin: {
                type: 'number',
                description: 'Minimum number of executors',
                default: 1
              },
              dynamicAllocationMax: {
                type: 'number',
                description: 'Maximum number of executors',
                default: 10
              },
              dataStoreIds: {
                type: 'array',
                items: { type: 'number' },
                description: 'Array of data store IDs this job depends on',
                default: []
              },
              sparkConf: {
                type: 'object',
                description: 'Additional Spark configuration as key-value pairs',
                additionalProperties: true,
                default: {}
              },
              timeToLiveSeconds: {
                type: 'number',
                description: 'Time to live for the job in seconds',
                default: 3600
              },
              isManualTrigger: {
                type: 'boolean',
                description: 'Whether this is a manual user trigger (required for first execution)',
                default: false
              }
            },
            required: ['sessionId', 'dataplaneId']
          }
        },
        {
          name: 'register_manual_execution',
          description: 'Register that a manual execution occurred, enabling auto-retry for this session',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID to enable auto-retry for'
              },
              runId: {
                type: 'string',
                description: 'Run ID from the manual execution'
              },
              success: {
                type: 'boolean',
                description: 'Whether the manual execution was successful'
              }
            },
            required: ['sessionId', 'success']
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
      
      case 'execute_and_monitor':
        return await this.handleExecuteAndMonitor(params as ExecuteAndMonitorParams);
      
      case 'register_manual_execution':
        return await this.handleRegisterManualExecution(params as any);
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Handle the execute_and_monitor tool with loop prevention and manual-first requirement
   */
  private async handleExecuteAndMonitor(params: ExecuteAndMonitorParams) {
    console.error('🚀 Executing code with monitoring and loop prevention...');
    
    const { sessionId, dataplaneId, isManualTrigger = false } = params;
    const MAX_EXECUTIONS = 3;
    const MIN_DELAY_MS = 30000; // 30 seconds between executions

    try {
      // Get or initialize execution tracking
      const tracking = this.executionTracking.get(sessionId) || { 
        count: 0, 
        lastExecution: new Date(0),
        hasManualExecution: false
      };
      const timeSinceLastExecution = Date.now() - tracking.lastExecution.getTime();

      // Check if this is the first execution and not manual
      if (!tracking.hasManualExecution && !isManualTrigger) {
        return {
          content: [
            {
              type: 'text',
              text: `🖱️ **Manual Execution Required**\n\nFor the first run of your code, please use the **Run** button in the workbench to execute manually.\n\nAfter the first manual execution:\n- I can automatically retry if errors occur\n- Auto-execution will be available for error recovery (up to ${MAX_EXECUTIONS} attempts per session)\n- This ensures you have full control over when code first runs`
            }
          ]
        };
      }

      if (tracking.count >= MAX_EXECUTIONS) {
        return {
          content: [
            {
              type: 'text',
              text: `🚫 **Auto-execution limit reached (${tracking.count}/${MAX_EXECUTIONS})**\n\nYou've reached the maximum number of automatic executions for this session. This prevents infinite loops.\n\n**To continue:**\n- Review and manually fix any remaining issues\n- Start a new chat session to reset the counter\n- Use the manual Run button in the workbench\n\n**Last error:** ${tracking.lastError || 'None recorded'}`
            }
          ],
          isError: true
        };
      }

      if (timeSinceLastExecution < MIN_DELAY_MS && tracking.count > 0) {
        const remainingDelay = Math.ceil((MIN_DELAY_MS - timeSinceLastExecution) / 1000);
        return {
          content: [
            {
              type: 'text',
              text: `⏱️ **Execution cooldown active**\n\nPlease wait ${remainingDelay} more seconds before the next automatic execution. This prevents rapid-fire executions that could cause issues.\n\n**Current execution count:** ${tracking.count}/${MAX_EXECUTIONS}`
            }
          ]
        };
      }

      // Update execution tracking
      tracking.count += 1;
      tracking.lastExecution = new Date();
      
      // Mark that we have a manual execution for this session
      if (isManualTrigger) {
        tracking.hasManualExecution = true;
        console.error(`✋ Manual execution registered for session ${sessionId}`);
      }
      
      this.executionTracking.set(sessionId, tracking);

      const executionType = isManualTrigger ? 'Manual' : 'Auto-retry';
      console.error(`🔢 ${executionType} execution ${tracking.count}/${MAX_EXECUTIONS} for session ${sessionId}`);

      // Call the Bolt.DIY adhoc run API
      const executionResult = await this.xdpClient.executeAdhocRun(params);

      if (!executionResult.success) {
        // Track the error
        tracking.lastError = executionResult.error || 'Execution failed';
        this.executionTracking.set(sessionId, tracking);

        const executionLabel = isManualTrigger ? `Manual Execution` : `Auto-retry ${tracking.count}/${MAX_EXECUTIONS}`;
        const nextSteps = isManualTrigger 
          ? `**Next steps:**\n- I can now automatically retry if you'd like me to fix the code\n- Auto-retry will be available for error recovery (${MAX_EXECUTIONS - tracking.count} attempts remaining)`
          : `**Next steps:**\n- Review the error above\n- I can automatically fix the code and try again (${MAX_EXECUTIONS - tracking.count} attempts remaining)\n- Or you can manually review and fix the issues`;

        return {
          content: [
            {
              type: 'text',
              text: `❌ **${executionLabel} Failed**\n\n**Error:** ${executionResult.error}\n\n**Run ID:** ${executionResult.runId || 'N/A'}\n\n**Logs:**\n\`\`\`\n${executionResult.logs || 'No logs available'}\n\`\`\`\n\n${nextSteps}`
            }
          ]
        };
      }

      // Success case
      const successLabel = isManualTrigger ? `Manual Execution` : `Auto-retry ${tracking.count}/${MAX_EXECUTIONS}`;
      const remainingInfo = isManualTrigger 
        ? `**Auto-retry now enabled** for error recovery (${MAX_EXECUTIONS - tracking.count} attempts available)`
        : `**Remaining auto-executions:** ${MAX_EXECUTIONS - tracking.count}`;
      
      const successMessage = `✅ **${successLabel} Successful**\n\n**Run ID:** ${executionResult.runId}\n**Status:** ${executionResult.status}\n\n**Logs:**\n\`\`\`\n${executionResult.logs || 'Execution completed successfully'}\n\`\`\`\n\n${remainingInfo}`;

      return {
        content: [
          {
            type: 'text',
            text: successMessage
          }
        ]
      };

    } catch (error) {
      // Track the error
      const tracking = this.executionTracking.get(sessionId);
      if (tracking) {
        tracking.lastError = error instanceof Error ? error.message : 'Unknown error';
        this.executionTracking.set(sessionId, tracking);
      }

      console.error('❌ Failed to execute and monitor:', error);
      throw error;
    }
  }

  /**
   * Handle registering a manual execution to enable auto-retry
   */
  private async handleRegisterManualExecution(params: {
    sessionId: string;
    runId?: string;
    success: boolean;
  }) {
    console.error('📝 Registering manual execution...');
    
    const { sessionId, runId, success } = params;

    try {
      // Get or initialize execution tracking
      const tracking = this.executionTracking.get(sessionId) || { 
        count: 0, 
        lastExecution: new Date(0),
        hasManualExecution: false
      };

      // Mark that manual execution has occurred
      tracking.hasManualExecution = true;
      if (runId) {
        tracking.lastRunId = runId;
      }
      
      this.executionTracking.set(sessionId, tracking);

      const statusMessage = success 
        ? `✅ **Manual Execution Successful**\n\nAuto-retry is now enabled for this session. If errors occur in future runs, I can automatically retry up to 3 times.`
        : `❌ **Manual Execution Failed**\n\nAuto-retry is now enabled for this session. I can help fix the issues and automatically retry up to 3 times.`;

      console.error(`✋ Manual execution registered for session ${sessionId}: ${success ? 'SUCCESS' : 'FAILED'}`);

      return {
        content: [
          {
            type: 'text',
            text: statusMessage
          }
        ]
      };

    } catch (error) {
      console.error('❌ Failed to register manual execution:', error);
      throw error;
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
  const port = parseInt(process.env.PORT || '9099');
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