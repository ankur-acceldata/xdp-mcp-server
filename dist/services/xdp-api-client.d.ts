/**
 * XDP API Client Service
 *
 * Handles communication with XDP API using access key + secret key authentication
 */
import type { XDPApiConfig, ListDataStoresParams, ListDataStoresResponse, TrinoQueryResponse, TrinoExecuteParams, ListDataplanesResponse } from '../types/xdp-types.js';
export declare class XDPApiClient {
    private client;
    private config;
    constructor(config?: Partial<XDPApiConfig>);
    /**
     * Format API errors for better user experience
     */
    private formatError;
    /**
     * List data stores from XDP API
     */
    listDataStores(params?: ListDataStoresParams): Promise<ListDataStoresResponse>;
    /**
     * Test the API connection
     */
    testConnection(): Promise<boolean>;
    /**
     * Get current configuration (without sensitive data)
     */
    getConfig(): Omit<XDPApiConfig, 'secretKey'>;
    /**
     * Execute a Trino query
     */
    executeTrinoQuery(params: TrinoExecuteParams): Promise<TrinoQueryResponse>;
    /**
     * List Trino catalogs
     */
    listTrinoCatalogs(dataplane: string): Promise<TrinoQueryResponse>;
    /**
     * List tables in a Trino schema
     */
    listTrinoTables(dataplane: string, catalog: string, schema: string): Promise<TrinoQueryResponse>;
    /**
     * Get column information for a Trino table
     */
    getTrinoTableColumns(dataplane: string, catalog: string, schema: string, table: string): Promise<TrinoQueryResponse>;
    /**
     * List all dataplanes from XDP API
     */
    listDataplanes(): Promise<ListDataplanesResponse>;
    /**
     * Execute adhoc run via Bolt.DIY API and monitor logs
     */
    executeAdhocRun(params: {
        projectId: string;
        dataplaneId: string;
        isEditAndRun?: boolean;
        selectedTemplate?: {
            id: string;
            name: string;
        };
    }): Promise<{
        success: boolean;
        runId?: string;
        status?: string;
        logs?: string;
        error?: string;
    }>;
}
//# sourceMappingURL=xdp-api-client.d.ts.map