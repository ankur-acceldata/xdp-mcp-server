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
            description: 'Execute a custom Trino SQL query on the specified dataplane (requires dataplane ID, not name)',
            inputSchema: {
              type: 'object',
              properties: {
                dataplane: {
                  type: 'string',
                  description: 'The dataplane ID (not name) to execute the query on. Use get_all_dataplanes to find the correct ID.'
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
            description: 'List all available Trino catalogs in the specified dataplane. ⚠️ CRITICAL: Use dataplane ID (number like "21"), NOT name (like "manoj-xdp-trino")',
            inputSchema: {
              type: 'object',
              properties: {
                dataplane: {
                  type: 'string',
                  description: 'The dataplane ID number (e.g., "21" not "manoj-xdp-trino"). Call get_all_dataplanes first to get the ID.'
                }
              },
              required: ['dataplane']
            }
          },
          {
            name: 'trino_list_tables',
            description: 'List tables in a Trino catalog and schema (requires dataplane ID, not name)',
            inputSchema: {
              type: 'object',
              properties: {
                dataplane: {
                  type: 'string',
                  description: 'The dataplane ID (not name). Use get_all_dataplanes to find the correct ID.'
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
            description: 'Get column information for a specific Trino table (requires dataplane ID, not name)',
            inputSchema: {
              type: 'object',
              properties: {
                dataplane: {
                  type: 'string',
                  description: 'The dataplane ID (not name). Use get_all_dataplanes to find the correct ID.'
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
            name: 'get_all_dataplanes',
            description: 'List all available dataplanes from XDP platform',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
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

          case 'get_all_dataplanes':
            return await this.handleGetAllDataplanes();

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
   * Handle the get_all_dataplanes tool
   */
  private async handleGetAllDataplanes() {
    console.error('🏗️ Fetching dataplanes from XDP API...');

    try {
      const result = await this.xdpClient.listDataplanes();

      // Return raw structured data with clear formatting
      const responseText = `# XDP Dataplanes

**IMPORTANT**: For Trino operations, use the **ID** number, NOT the name!

## Available Dataplanes:

${result.dataplanes.map((dp: any, index: number) => `
**${index + 1}. ${dp.name}**
- **🆔 USE THIS ID FOR TRINO**: ${dp.id}
- **Name**: ${dp.name}
- **Status**: ${dp.status}
- **Tenant**: ${dp.tenantId}
${dp.description ? `- **Description**: ${dp.description}` : ''}
${dp.externalUrl ? `- **URL**: ${dp.externalUrl}` : ''}
`).join('\n')}

**Total**: ${result.dataplanes.length} dataplanes

**⚠️ REMINDER**: When using trino_list_catalogs, trino_execute_query, etc., use the **ID number** (e.g., ${result.dataplanes[0]?.id}), not the name (e.g., "${result.dataplanes[0]?.name}").`;

      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
        ]
      };
    } catch (error) {
      console.error('❌ Failed to fetch dataplanes:', error);
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
   * Format the dataplanes response for display
   */
  private formatDataplanesResponse(result: any): string {
    const { dataplanes, pagination } = result;

    let response = `# XDP Dataplanes\n\n`;
    response += `**Total**: ${pagination.totalElements} dataplanes\n`;
    response += `**Page**: ${pagination.page + 1} of ${pagination.totalPages}\n`;
    response += `**Showing**: ${dataplanes.length} items\n\n`;

    if (dataplanes.length === 0) {
      response += `No dataplanes found.\n`;
      return response;
    }

    response += `## Dataplanes\n\n`;

    dataplanes.forEach((dp: any, index: number) => {
      response += `### ${index + 1}. ${dp.name || 'Unnamed'}\n`;
      response += `- **ID**: ${dp.id}\n`;
      response += `- **Dataplane ID**: ${dp.id}\n`;
      response += `- **Tenant**: ${dp.tenantId}\n`;
      if (dp.description) {
        response += `- **Description**: ${dp.description}\n`;
      }
      if (dp.status) {
        response += `- **Status**: ${dp.status}\n`;
      }
      if (dp.createdAt) {
        response += `- **Created**: ${new Date(dp.createdAt).toLocaleString()}\n`;
      }
      if (dp.updatedAt) {
        response += `- **Last Updated**: ${new Date(dp.updatedAt).toLocaleString()}\n`;
      }
      response += `\n`;
    });

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