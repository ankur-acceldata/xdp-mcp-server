/**
 * XDP API Client Service
 *
 * Handles communication with XDP API using access key + secret key authentication
 */
import type { XDPApiConfig, ListDataStoresParams, ListDataStoresResponse } from '../types/xdp-types.js';
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
}
//# sourceMappingURL=xdp-api-client.d.ts.map