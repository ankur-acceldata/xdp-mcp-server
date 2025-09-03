#!/usr/bin/env node
/**
 * XDP MCP Server
 *
 * A Model Context Protocol server that provides access to XDP (eXtended Data Platform) functionality.
 * This server connects to XDP API to fetch data stores and other data engineering resources.
 */
declare class XDPMCPServer {
    private server;
    private xdpClient;
    constructor();
    private setupHandlers;
    /**
     * Handle the xdp_list_datastores tool
     */
    private handleListDataStores;
    /**
     * Handle Trino query execution
     */
    private handleTrinoExecuteQuery;
    /**
     * Handle listing Trino catalogs
     */
    private handleTrinoListCatalogs;
    /**
     * Handle listing Trino tables
     */
    private handleTrinoListTables;
    /**
     * Handle describing a Trino table
     */
    private handleTrinoDescribeTable;
    /**
     * Format the datastore response for display
     */
    private formatDataStoresResponse;
    /**
     * Format Trino query response
     */
    private formatTrinoQueryResponse;
    /**
     * Format Trino catalogs response
     */
    private formatTrinoCatalogsResponse;
    /**
     * Format Trino tables response
     */
    private formatTrinoTablesResponse;
    /**
     * Format Trino table columns response
     */
    private formatTrinoTableColumnsResponse;
    /**
     * Start the MCP server
     */
    start(): Promise<void>;
}
export { XDPMCPServer };
//# sourceMappingURL=index.d.ts.map