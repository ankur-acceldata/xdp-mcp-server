#!/usr/bin/env node
/**
 * XDP MCP Server
 *
 * A Model Context Protocol server that provides access to XDP (eXtended Data Platform) functionality.
 * This server connects to XDP API to fetch data stores and other data engineering resources.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { XDPApiClient } from './services/xdp-api-client.js';
class XDPMCPServer {
    server;
    xdpClient;
    constructor() {
        console.error('🚀 Initializing XDP MCP Server...');
        try {
            // Initialize XDP API client
            this.xdpClient = new XDPApiClient();
            console.error('✅ XDP API client initialized');
            console.error('📊 Config:', this.xdpClient.getConfig());
        }
        catch (error) {
            console.error('❌ Failed to initialize XDP API client:', error);
            process.exit(1);
        }
        // Initialize MCP server
        this.server = new Server({
            name: 'xdp-mcp-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupHandlers();
    }
    setupHandlers() {
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
                        return await this.handleListDataStores(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
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
    async handleListDataStores(params) {
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
        }
        catch (error) {
            console.error('❌ Failed to fetch datastores:', error);
            throw error;
        }
    }
    /**
     * Format the datastore response for display
     */
    formatDataStoresResponse(result) {
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
        datastores.forEach((ds, index) => {
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
     * Start the MCP server
     */
    async start() {
        console.error('🔌 Starting MCP server with stdio transport...');
        // Test XDP API connection before starting
        try {
            const isConnected = await this.xdpClient.testConnection();
            if (isConnected) {
                console.error('✅ XDP API connection test passed');
            }
            else {
                console.error('⚠️  XDP API connection test failed, but continuing...');
            }
        }
        catch (error) {
            console.error('⚠️  XDP API connection test error:', error);
            console.error('🔄 Continuing anyway - will retry on tool execution');
        }
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('✅ XDP MCP Server started and ready for connections');
    }
}
// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new XDPMCPServer();
    server.start().catch((error) => {
        console.error('💥 Failed to start XDP MCP Server:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map