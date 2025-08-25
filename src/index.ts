#!/usr/bin/env node

/**
 * XDP MCP Server
 * 
 * A Model Context Protocol server that provides access to XDP (eXtended Data Platform) functionality.
 * This server connects to XDP API to fetch data stores and other data engineering resources.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { XDPApiClient } from './services/xdp-api-client.js';
import type { ListDataStoresParams, TrinoExecuteParams } from './types/xdp-types.js';

class XDPMCPServer {
  private server: Server;
  private xdpClient: XDPApiClient;
  private executionTracking: Map<string, { 
    count: number; 
    lastExecution: Date; 
    lastError?: string; 
    hasManualExecution: boolean;
    lastRunId?: string;
  }> = new Map();

  constructor() {
    console.error('🚀 Initializing XDP MCP Server...');
    
    try {
      // Initialize XDP API client
      this.xdpClient = new XDPApiClient();
      console.error('✅ XDP API client initialized');
      console.error('📊 Config:', this.xdpClient.getConfig());
    } catch (error) {
      console.error('❌ Failed to initialize XDP API client:', error);
      process.exit(1);
    }
    
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'xdp-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('📋 Listing available tools...');
      
      return {
        tools: [
          {
            name: 'xdp_list_datastores',
            description: 'List all data stores from XDP platform with pagination support',
            inputSchema: {
              type: 'object',
              properties: {
                page: {
                  type: 'number',
                  description: 'Page number (0-based)',
                  default: 0,
                  minimum: 0
                },
                size: {
                  type: 'number',
                  description: 'Number of items per page',
                  default: 20,
                  minimum: 1,
                  maximum: 100
                },
                sortBy: {
                  type: 'string',
                  description: 'Sort field and direction (e.g., "updatedAt:asc", "name:desc")',
                  default: 'updatedAt:asc'
                }
              }
            }
          },
          {
            name: 'trino_execute_query',
            description: 'Execute a custom Trino SQL query on the specified dataplane',
            inputSchema: {
              type: 'object',
              properties: {
                dataplane: {
                  type: 'string',
                  description: 'The dataplane ID to execute the query on'
                },
                query: {
                  type: 'string',
                  description: 'The Trino SQL query to execute'
                }
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
                dataplane: {
                  type: 'string',
                  description: 'The dataplane ID to list catalogs from'
                }
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
                dataplane: {
                  type: 'string',
                  description: 'The dataplane ID'
                },
                catalog: {
                  type: 'string',
                  description: 'The Trino catalog name'
                },
                schema: {
                  type: 'string',
                  description: 'The schema name (optional, if not provided lists all tables in catalog)'
                }
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
                dataplane: {
                  type: 'string',
                  description: 'The dataplane ID'
                },
                catalog: {
                  type: 'string',
                  description: 'The Trino catalog name'
                },
                schema: {
                  type: 'string',
                  description: 'The schema name'
                },
                table: {
                  type: 'string',
                  description: 'The table name'
                }
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
                projectId: {
                  type: 'string',
                  description: 'Project ID for the code to execute'
                },
                dataplaneId: {
                  type: 'string',
                  description: 'Dataplane ID where code should be executed'
                },
                isEditAndRun: {
                  type: 'boolean',
                  description: 'Whether to edit config before running',
                  default: false
                },
                selectedTemplate: {
                  type: 'object',
                  description: 'Template configuration for execution',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                  }
                },
                isManualTrigger: {
                  type: 'boolean',
                  description: 'Whether this is a manual user trigger (required for first execution)',
                  default: false
                }
              },
              required: ['sessionId', 'projectId', 'dataplaneId']
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
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.error(`🔧 Executing tool: ${name}`);
      console.error(`📝 Arguments:`, args);

      try {
        switch (name) {
          case 'xdp_list_datastores':
            return await this.handleListDataStores(args as ListDataStoresParams);
          
          case 'trino_execute_query':
            return await this.handleTrinoExecuteQuery(args as any);
          
          case 'trino_list_catalogs':
            return await this.handleTrinoListCatalogs(args as any);
          
          case 'trino_list_tables':
            return await this.handleTrinoListTables(args as any);
          
          case 'trino_describe_table':
            return await this.handleTrinoDescribeTable(args as any);
          
          case 'execute_and_monitor':
            return await this.handleExecuteAndMonitor(args as any);
          
          case 'register_manual_execution':
            return await this.handleRegisterManualExecution(args as any);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`❌ Tool execution failed:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ],
          isError: true
        };
      }
    });
  }

  /**
   * Handle the xdp_list_datastores tool
   */
  private async handleListDataStores(params: ListDataStoresParams) {
    console.error('📊 Fetching datastores from XDP API...');
    
    try {
      const result = await this.xdpClient.listDataStores(params);
      
      // Format the response for better readability
      const responseText = this.formatDataStoresResponse(result);
      
      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
        ]
      };
    } catch (error) {
      console.error('❌ Failed to fetch datastores:', error);
      throw error;
    }
  }

  /**
   * Handle Trino query execution
   */
  private async handleTrinoExecuteQuery(params: TrinoExecuteParams) {
    console.error('🔍 Executing Trino query...');
    
    try {
      const result = await this.xdpClient.executeTrinoQuery(params);
      const responseText = this.formatTrinoQueryResponse(result, params.query);
      
      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
        ]
      };
    } catch (error) {
      console.error('❌ Failed to execute Trino query:', error);
      throw error;
    }
  }

  /**
   * Handle listing Trino catalogs
   */
  private async handleTrinoListCatalogs(params: { dataplane: string }) {
    console.error('📚 Listing Trino catalogs...');
    
    try {
      const result = await this.xdpClient.listTrinoCatalogs(params.dataplane);
      const responseText = this.formatTrinoCatalogsResponse(result);
      
      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
        ]
      };
    } catch (error) {
      console.error('❌ Failed to list Trino catalogs:', error);
      throw error;
    }
  }

  /**
   * Handle listing Trino tables
   */
  private async handleTrinoListTables(params: { dataplane: string; catalog: string; schema?: string }) {
    console.error('📋 Listing Trino tables...');
    
    try {
      const result = await this.xdpClient.listTrinoTables(params.dataplane, params.catalog, params.schema || '');
      const responseText = this.formatTrinoTablesResponse(result, params.catalog, params.schema);
      
      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
        ]
      };
    } catch (error) {
      console.error('❌ Failed to list Trino tables:', error);
      throw error;
    }
  }

  /**
   * Handle describing a Trino table
   */
  private async handleTrinoDescribeTable(params: { dataplane: string; catalog: string; schema: string; table: string }) {
    console.error('🔍 Describing Trino table...');
    
    try {
      const result = await this.xdpClient.getTrinoTableColumns(
        params.dataplane, 
        params.catalog, 
        params.schema, 
        params.table
      );
      const responseText = this.formatTrinoTableColumnsResponse(result, params.catalog, params.schema, params.table);
      
      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
        ]
      };
    } catch (error) {
      console.error('❌ Failed to describe Trino table:', error);
      throw error;
    }
  }

  /**
   * Handle the execute_and_monitor tool with loop prevention and manual-first requirement
   */
  private async handleExecuteAndMonitor(params: {
    sessionId: string;
    projectId: string;
    dataplaneId: string;
    isEditAndRun?: boolean;
    selectedTemplate?: { id: string; name: string };
    isManualTrigger?: boolean;
  }) {
    console.error('🚀 Executing code with monitoring and loop prevention...');
    
    const { sessionId, projectId, dataplaneId, isEditAndRun = false, selectedTemplate, isManualTrigger = false } = params;
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
      const executionResult = await this.xdpClient.executeAdhocRun({
        projectId,
        dataplaneId,
        isEditAndRun,
        selectedTemplate
      });

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

  /**
   * Format the datastore response for display
   */
  private formatDataStoresResponse(result: any): string {
    const { datastores, pagination } = result;
    
    let response = `# XDP Data Stores\n\n`;
    response += `**Total**: ${pagination.totalElements} datastores\n`;
    response += `**Page**: ${pagination.page + 1} of ${pagination.totalPages}\n`;
    response += `**Showing**: ${datastores.length} items\n\n`;

    if (datastores.length === 0) {
      response += `No data stores found.\n`;
      return response;
    }

    response += `## Data Stores\n\n`;
    
    datastores.forEach((ds: any, index: number) => {
      response += `### ${index + 1}. ${ds.name || 'Unnamed'}\n`;
      response += `- **ID**: ${ds.id}\n`;
      response += `- **Type**: ${ds.dataStoreType || 'Unknown'}\n`;
      response += `- **Dataplane ID**: ${ds.dataplaneId}\n`;
      response += `- **Tenant**: ${ds.tenantId}\n`;
      response += `- **Credentials Configured**: ${ds.isCredentialConfigured ? '✅ Yes' : '❌ No'}\n`;
      if (ds.config && ds.config.url) {
        response += `- **URL**: ${ds.config.url}\n`;
      }
      if (ds.updatedAt) {
        response += `- **Last Updated**: ${new Date(ds.updatedAt).toLocaleString()}\n`;
      }
      response += `\n`;
    });

    return response;
  }

  /**
   * Format Trino query response
   */
  private formatTrinoQueryResponse(result: any, query: string): string {
    let response = `# Trino Query Result\n\n`;
    response += `**Query**: \`\`\`sql\n${query}\n\`\`\`\n\n`;
    response += `**Status**: ${result.status}\n`;
    response += `**Query ID**: ${result.queryId}\n\n`;

    if (!result.result || !result.result.data) {
      response += `No results returned.\n`;
      return response;
    }

    const { columns, data } = result.result;
    
    if (!columns || columns.length === 0) {
      response += `No columns in result set.\n`;
      return response;
    }

    response += `**Results**: ${data.length} rows\n\n`;

    // Format as a table
    if (data.length > 0) {
      // Table header
      response += '| ' + columns.map((c: any) => c.name).join(' | ') + ' |\n';
      response += '|' + columns.map(() => '---').join('|') + '|\n';
      
      // Table rows (limit to first 50 for readability)
      const displayRows = data.slice(0, 50);
      displayRows.forEach((row: any[]) => {
        response += '| ' + row.map(val => val === null ? 'NULL' : String(val)).join(' | ') + ' |\n';
      });
      
      if (data.length > 50) {
        response += `\n*Showing first 50 of ${data.length} rows*\n`;
      }
    }

    return response;
  }

  /**
   * Format Trino catalogs response
   */
  private formatTrinoCatalogsResponse(result: any): string {
    let response = `# Trino Catalogs\n\n`;

    if (!result.result || !result.result.data || result.result.data.length === 0) {
      response += `No catalogs found.\n`;
      return response;
    }

    response += `**Available Catalogs**:\n\n`;
    result.result.data.forEach((row: any[], index: number) => {
      response += `${index + 1}. ${row[0]}\n`;
    });

    return response;
  }

  /**
   * Format Trino tables response
   */
  private formatTrinoTablesResponse(result: any, catalog: string, schema?: string): string {
    let response = `# Trino Tables\n\n`;
    response += `**Catalog**: ${catalog}\n`;
    if (schema) {
      response += `**Schema**: ${schema}\n`;
    }
    response += '\n';

    if (!result.result || !result.result.data || result.result.data.length === 0) {
      response += `No tables found.\n`;
      return response;
    }

    const { columns, data } = result.result;

    // If we have multiple columns (schema, table, type), show as table
    if (columns && columns.length > 1) {
      response += '| ' + columns.map((c: any) => c.name).join(' | ') + ' |\n';
      response += '|' + columns.map(() => '---').join('|') + '|\n';
      
      data.forEach((row: any[]) => {
        response += '| ' + row.map(val => val === null ? 'NULL' : String(val)).join(' | ') + ' |\n';
      });
    } else {
      // Simple list of table names
      response += `**Tables**:\n\n`;
      data.forEach((row: any[], index: number) => {
        response += `${index + 1}. ${row[0]}\n`;
      });
    }

    response += `\n**Total**: ${data.length} tables\n`;

    return response;
  }

  /**
   * Format Trino table columns response
   */
  private formatTrinoTableColumnsResponse(result: any, catalog: string, schema: string, table: string): string {
    let response = `# Table Structure\n\n`;
    response += `**Table**: ${catalog}.${schema}.${table}\n\n`;

    if (!result.result || !result.result.data || result.result.data.length === 0) {
      response += `No columns found.\n`;
      return response;
    }

    const { data } = result.result;

    response += `## Columns\n\n`;
    response += '| Position | Column Name | Data Type | Nullable | Default |\n';
    response += '|----------|-------------|-----------|----------|---------|\n';
    
    data.forEach((row: any[]) => {
      const [columnName, dataType, isNullable, columnDefault, ordinalPosition] = row;
      response += `| ${ordinalPosition} | ${columnName} | ${dataType} | ${isNullable} | ${columnDefault || 'NULL'} |\n`;
    });

    response += `\n**Total Columns**: ${data.length}\n`;

    return response;
  }

  /**
   * Start the MCP server
   */
  async start() {
    console.error('🔌 Starting MCP server with stdio transport...');
    
    // Test XDP API connection before starting
    try {
      const isConnected = await this.xdpClient.testConnection();
      if (isConnected) {
        console.error('✅ XDP API connection test passed');
      } else {
        console.error('⚠️  XDP API connection test failed, but continuing...');
      }
    } catch (error) {
      console.error('⚠️  XDP API connection test error:', error);
      console.error('🔄 Continuing anyway - will retry on tool execution');
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('✅ XDP MCP Server started and ready for connections');
  }
}

// Export for use in other modules
export { XDPMCPServer };

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new XDPMCPServer();
  server.start().catch((error) => {
    console.error('💥 Failed to start XDP MCP Server:', error);
    process.exit(1);
  });
}