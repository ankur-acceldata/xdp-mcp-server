/**
 * XDP API Client Service
 *
 * Handles communication with XDP API using access key + secret key authentication
 */
import axios from 'axios';
export class XDPApiClient {
    client;
    config;
    constructor(config) {
        this.config = {
            baseUrl: config?.baseUrl || process.env.XDP_BASE_URL || 'https://demo.xdp-playground.acceldata.tech/xdp-cp-service/api',
            accessKey: config?.accessKey || process.env.XDP_ACCESS_KEY || '',
            secretKey: config?.secretKey || process.env.XDP_SECRET_KEY || ''
        };
        // Validate required configuration
        if (!this.config.accessKey || !this.config.secretKey) {
            throw new Error('XDP API credentials are required. Set XDP_ACCESS_KEY and XDP_SECRET_KEY environment variables.');
        }
        this.client = axios.create({
            baseURL: this.config.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'accessKey': this.config.accessKey,
                'secretKey': this.config.secretKey
            },
            timeout: 30000 // 30 second timeout
        });
        // Add request interceptor for logging
        this.client.interceptors.request.use((config) => {
            console.error(`[XDP API] ${config.method?.toUpperCase()} ${config.url}`);
            return config;
        }, (error) => {
            console.error('[XDP API] Request error:', error.message);
            return Promise.reject(error);
        });
        // Add response interceptor for error handling
        this.client.interceptors.response.use((response) => {
            console.error(`[XDP API] Response ${response.status} from ${response.config.url}`);
            return response;
        }, (error) => {
            console.error(`[XDP API] Response error: ${error.response?.status} - ${error.message}`);
            return Promise.reject(this.formatError(error));
        });
    }
    /**
     * Format API errors for better user experience
     */
    formatError(error) {
        if (error.response?.status === 401) {
            return new Error('Authentication failed. Please check your access key and secret key.');
        }
        if (error.response?.status === 403) {
            return new Error('Access denied. You may not have permission to access this resource.');
        }
        if (error.response?.status === 404) {
            return new Error('Resource not found. The API endpoint may not exist.');
        }
        if (error.response?.status === 429) {
            return new Error('Rate limit exceeded. Please wait before making more requests.');
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return new Error('Unable to connect to XDP API. Please check your network connection.');
        }
        if (error.code === 'ECONNABORTED') {
            return new Error('Request timeout. The XDP API is taking too long to respond.');
        }
        return new Error(`XDP API error: ${error.message}`);
    }
    /**
     * List data stores from XDP API
     */
    async listDataStores(params = {}) {
        try {
            const queryParams = {
                page: params.page || 0,
                size: params.size || 20,
                sort_by: params.sortBy || 'updatedAt:asc'
            };
            console.error(`[XDP API] Fetching datastores with params:`, queryParams);
            const response = await this.client.get('/datastore', {
                params: queryParams
            });
            // Check if the API call was successful
            if (!response.data.success) {
                throw new Error(`XDP API error: ${response.data.message} - ${response.data.detailedMessage}`);
            }
            // Transform the response to our expected format
            const result = {
                datastores: response.data.data.dataStores,
                pagination: {
                    page: response.data.data.meta.page,
                    size: response.data.data.meta.size,
                    totalElements: response.data.data.meta.count,
                    totalPages: Math.ceil(response.data.data.meta.count / response.data.data.meta.size)
                }
            };
            console.error(`[XDP API] Successfully fetched ${result.datastores.length} datastores`);
            return result;
        }
        catch (error) {
            console.error('[XDP API] Failed to fetch datastores:', error);
            throw error;
        }
    }
    /**
     * Test the API connection
     */
    async testConnection() {
        try {
            await this.listDataStores({ page: 0, size: 1 });
            return true;
        }
        catch (error) {
            console.error('[XDP API] Connection test failed:', error);
            return false;
        }
    }
    /**
     * Get current configuration (without sensitive data)
     */
    getConfig() {
        return {
            baseUrl: this.config.baseUrl,
            accessKey: this.config.accessKey.substring(0, 4) + '***'
        };
    }
    /**
     * Execute a Trino query
     */
    async executeTrinoQuery(params) {
        try {
            const queryRequest = {
                engine: 'TRINO',
                dataplane: params.dataplane,
                query: params.query
            };
            console.error(`[XDP API] Executing Trino query on dataplane ${params.dataplane}`);
            console.error(`[XDP API] Query: ${params.query.substring(0, 100)}...`);
            const response = await this.client.post('/query/execute', queryRequest);
            // Check if the query failed
            if (response.data.error || response.data.result?.error) {
                const errorMsg = response.data.error || response.data.result?.error;
                throw new Error(`Trino query error: ${errorMsg}`);
            }
            console.error(`[XDP API] Query executed successfully. Status: ${response.data.status}`);
            return response.data;
        }
        catch (error) {
            console.error('[XDP API] Failed to execute Trino query:', error);
            throw error;
        }
    }
    /**
     * List Trino catalogs
     */
    async listTrinoCatalogs(dataplane) {
        return this.executeTrinoQuery({
            dataplane,
            query: 'SHOW CATALOGS'
        });
    }
    /**
     * List tables in a Trino schema
     */
    async listTrinoTables(dataplane, catalog, schema) {
        const query = schema
            ? `SHOW TABLES FROM ${catalog}.${schema}`
            : `SELECT table_schema, table_name, table_type FROM ${catalog}.information_schema.tables`;
        return this.executeTrinoQuery({
            dataplane,
            query
        });
    }
    /**
     * Get column information for a Trino table
     */
    async getTrinoTableColumns(dataplane, catalog, schema, table) {
        const query = `
      SELECT column_name, data_type, is_nullable, column_default, ordinal_position 
      FROM ${catalog}.information_schema.columns 
      WHERE table_schema = '${schema}' AND table_name = '${table}' 
      ORDER BY ordinal_position
    `.trim();
        return this.executeTrinoQuery({
            dataplane,
            query
        });
    }
    /**
     * List all dataplanes from XDP API
     */
    async listDataplanes() {
        try {
            console.error(`[XDP API] Fetching dataplanes...`);
            const response = await this.client.get('/dataplane');
            // Transform the response to our expected format
            const result = {
                dataplanes: response.data.dataplanes || [],
                pagination: {
                    page: response.data.meta.page,
                    size: response.data.meta.size,
                    totalElements: response.data.meta.count,
                    totalPages: Math.ceil(response.data.meta.count / response.data.meta.size)
                }
            };
            console.error(`[XDP API] Successfully fetched ${result.dataplanes.length} dataplanes`);
            return result;
        }
        catch (error) {
            console.error('[XDP API] Failed to fetch dataplanes:', error);
            throw error;
        }
    }
    /**
     * Execute adhoc run via Bolt.DIY API and monitor logs
     */
    async executeAdhocRun(params) {
        try {
            console.error(`[XDP API] Executing adhoc run for project ${params.projectId} on dataplane ${params.dataplaneId}`);
            // Call Bolt.DIY's adhoc-run API
            const boltApiUrl = process.env.BOLT_API_URL || 'http://localhost:5173';
            const payload = {
                dataplaneId: parseInt(params.dataplaneId),
                projectId: params.projectId,
                isEditAndRun: params.isEditAndRun || false,
                selectedTemplate: params.selectedTemplate
            };
            const response = await axios.post(`${boltApiUrl}/api/adhoc-run`, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // 60 second timeout for execution
            });
            const result = response.data;
            if (!result.success || !result.data?.success) {
                return {
                    success: false,
                    error: result.data?.message || result.message || 'Execution failed',
                    runId: result.data?.data?.id?.toString()
                };
            }
            const runId = result.data?.data?.id?.toString();
            console.error(`[XDP API] Adhoc run started successfully with runId: ${runId}`);
            // Wait a moment for execution to start, then fetch initial logs
            await new Promise(resolve => setTimeout(resolve, 3000));
            let logs = '';
            try {
                // Try to fetch logs - this is a best effort
                const logsResponse = await axios.get(`${boltApiUrl}/api/log-stream`, {
                    params: {
                        dataplaneId: params.dataplaneId,
                        runId: runId,
                        tailLines: 100
                    },
                    timeout: 10000,
                    headers: {
                        'Accept': 'text/event-stream'
                    }
                });
                // Parse log data if available
                if (logsResponse.data) {
                    logs = typeof logsResponse.data === 'string' ? logsResponse.data : JSON.stringify(logsResponse.data);
                }
            }
            catch (logError) {
                console.error('[XDP API] Could not fetch logs:', logError);
                logs = 'Logs are being generated. Check the Bolt.DIY interface for real-time logs.';
            }
            return {
                success: true,
                runId: runId,
                status: 'STARTED',
                logs: logs || 'Execution started successfully. Check logs panel for details.'
            };
        }
        catch (error) {
            console.error('[XDP API] Failed to execute adhoc run:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: errorMessage
            };
        }
    }
}
//# sourceMappingURL=xdp-api-client.js.map