/**
 * XDP API Client Service
 * 
 * Handles communication with XDP API using access key + secret key authentication
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type { 
  XDPApiConfig, 
  XDPApiResponse, 
  ListDataStoresParams,
  ListDataStoresResponse,
  TrinoQueryRequest,
  TrinoQueryResponse,
  TrinoExecuteParams,
  Dataplane,
  ListDataplanesResponse,
  XDPDataplanesApiResponse
} from '../types/xdp-types.js';

export class XDPApiClient {
  private client: AxiosInstance;
  private config: XDPApiConfig;

  constructor(config?: Partial<XDPApiConfig>) {
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
    this.client.interceptors.request.use(
      (config) => {
        console.error(`[XDP API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[XDP API] Request error:', error.message);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        console.error(`[XDP API] Response ${response.status} from ${response.config.url}`);
        return response;
      },
      (error: AxiosError) => {
        console.error(`[XDP API] Response error: ${error.response?.status} - ${error.message}`);
        return Promise.reject(this.formatError(error));
      }
    );
  }

  /**
   * Format API errors for better user experience
   */
  private formatError(error: AxiosError): Error {
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
  async listDataStores(params: ListDataStoresParams = {}): Promise<ListDataStoresResponse> {
    try {
      const queryParams = {
        page: params.page || 0,
        size: params.size || 20,
        sort_by: params.sortBy || 'updatedAt:asc'
      };

      console.error(`[XDP API] Fetching datastores with params:`, queryParams);

      const response = await this.client.get<XDPApiResponse>('/datastore', {
        params: queryParams
      });

      // Check if the API call was successful
      if (!response.data.success) {
        throw new Error(`XDP API error: ${response.data.message} - ${response.data.detailedMessage}`);
      }

      // Transform the response to our expected format
      const result: ListDataStoresResponse = {
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

    } catch (error) {
      console.error('[XDP API] Failed to fetch datastores:', error);
      throw error;
    }
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.listDataStores({ page: 0, size: 1 });
      return true;
    } catch (error) {
      console.error('[XDP API] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get current configuration (without sensitive data)
   */
  getConfig(): Omit<XDPApiConfig, 'secretKey'> {
    return {
      baseUrl: this.config.baseUrl,
      accessKey: this.config.accessKey.substring(0, 4) + '***'
    };
  }

  /**
   * Execute a Trino query
   */
  async executeTrinoQuery(params: TrinoExecuteParams): Promise<TrinoQueryResponse> {
    try {
      const queryRequest: TrinoQueryRequest = {
        engine: 'TRINO',
        dataplane: params.dataplane,
        query: params.query
      };

      console.error(`[XDP API] Executing Trino query on dataplane ${params.dataplane}`);
      console.error(`[XDP API] Query: ${params.query.substring(0, 100)}...`);

      const response = await this.client.post<TrinoQueryResponse>('/query/execute', queryRequest);

      // Check if the query failed
      if (response.data.error || response.data.result?.error) {
        const errorMsg = response.data.error || response.data.result?.error;
        throw new Error(`Trino query error: ${errorMsg}`);
      }

      console.error(`[XDP API] Query executed successfully. Status: ${response.data.status}`);
      return response.data;

    } catch (error) {
      console.error('[XDP API] Failed to execute Trino query:', error);
      throw error;
    }
  }

  /**
   * List Trino catalogs
   */
  async listTrinoCatalogs(dataplane: string): Promise<TrinoQueryResponse> {
    return this.executeTrinoQuery({
      dataplane,
      query: 'SHOW CATALOGS'
    });
  }

  /**
   * List tables in a Trino schema
   */
  async listTrinoTables(dataplane: string, catalog: string, schema: string): Promise<TrinoQueryResponse> {
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
  async getTrinoTableColumns(
    dataplane: string, 
    catalog: string, 
    schema: string, 
    table: string
  ): Promise<TrinoQueryResponse> {
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
  async listDataplanes(): Promise<ListDataplanesResponse> {
    try {
      console.error(`[XDP API] Fetching dataplanes...`);

      const response = await this.client.get<XDPDataplanesApiResponse>('/dataplane');

      // Transform the response to our expected format
      const result: ListDataplanesResponse = {
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

    } catch (error) {
      console.error('[XDP API] Failed to fetch dataplanes:', error);
      throw error;
    }
  }

  /**
   * Execute adhoc run via Bolt.DIY API and monitor logs
   */
  async executeAdhocRun(params: {
    dataplaneId: string;
    jobType?: string;
    description?: string;
    name?: string;
    image?: string;
    imagePullSecrets?: string[];
    imagePullPolicy?: string;
    codeSourceUrl?: string;
    stages?: string[];
    executionType?: string;
    executionMode?: string;
    driverCores?: number;
    driverMemory?: string;
    driverMemoryOverhead?: string;
    executorInstances?: number;
    executorCores?: number;
    executorMemory?: string;
    executorMemoryOverhead?: string;
    dynamicAllocationEnabled?: boolean;
    dynamicAllocationInitial?: number;
    dynamicAllocationMin?: number;
    dynamicAllocationMax?: number;
    dataStoreIds?: number[];
    sparkConf?: Record<string, any>;
    timeToLiveSeconds?: number;
  }): Promise<{
    success: boolean;
    runId?: string;
    status?: string;
    logs?: string;
    error?: string;
  }> {
    try {
      console.error(`[XDP API] Executing adhoc run on dataplane ${params.dataplaneId}`);

      // Call Bolt.DIY's adhoc-run API using new AdhocRunRequestBody format
      const boltApiUrl = process.env.BOLT_API_URL || 'http://localhost:5173';
      const payload = {
        dataplaneId: parseInt(params.dataplaneId),
        jobType: params.jobType || "SPARK",
        description: params.description || `Adhoc run on dataplane ${params.dataplaneId}`,
        name: params.name || `adhoc-run-${Date.now()}`,
        executionConfig: {
          jobType: params.jobType || "SPARK",
          image: params.image || "spark:3.3.0",
          imagePullSecrets: params.imagePullSecrets || [],
          imagePullPolicy: params.imagePullPolicy || "IfNotPresent",
          codeSource: {
            type: "MINIO",
            config: {
              url: params.codeSourceUrl || "",
              additionalParams: {}
            }
          },
          stages: params.stages || ["main"],
          type: params.executionType || "Python",
          mode: params.executionMode || "cluster",
          driver: {
            cores: params.driverCores || 1,
            memory: params.driverMemory || "1g",
            memoryOverhead: params.driverMemoryOverhead || "512m"
          },
          executor: {
            instances: params.executorInstances || 2,
            cores: params.executorCores || 1,
            memory: params.executorMemory || "1g",
            memoryOverhead: params.executorMemoryOverhead || "512m"
          },
          dynamicAllocation: {
            enabled: params.dynamicAllocationEnabled || false,
            initialExecutors: params.dynamicAllocationInitial || 2,
            minExecutors: params.dynamicAllocationMin || 1,
            maxExecutors: params.dynamicAllocationMax || 10,
            shuffleTrackingTimeout: 60
          },
          depends: {
            dataStores: (params.dataStoreIds || []).map(id => ({ dataStoreId: id }))
          },
          sparkConf: params.sparkConf || {},
          timeToLiveSeconds: params.timeToLiveSeconds || 3600
        }
      };

      const url = `${this.config.baseUrl}/job/adhoc-runs`;
      const requestHeaders = {
        'Content-Type': 'application/json',
        'accessKey': this.config.accessKey,
        'secretKey': this.config.secretKey
      };
      
      console.error(`[XDP API] Calling URL: ${url}`);
      console.error(`[XDP API] Headers:`, JSON.stringify(requestHeaders, null, 2));
      console.error(`[XDP API] Payload:`, JSON.stringify(payload, null, 2));

      const response = await this.client.post(`/job/adhoc-runs`, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout for execution
      });

      console.error(`[XDP API] Raw response received, parsing...`);
      let result;
      try {
        result = response.data;
        console.error(`[XDP API] Response status:`, response.status);
        console.error(`[XDP API] Response statusText:`, response.statusText);
        console.error(`[XDP API] Full response:`, JSON.stringify(result, null, 2));
        
        // More detailed parsing check
        console.error(`[XDP API] result.success:`, result.success);
        console.error(`[XDP API] result.data:`, result.data);
        console.error(`[XDP API] result.data?.success:`, result.data?.success);
        console.error(`[XDP API] result?.data:`, result?.data);
        console.error(`[XDP API] result?.data?.id:`, result?.data?.id);
        
      } catch (parseError) {
        console.error(`[XDP API] Error parsing response:`, parseError);
        return {
          success: false,
          error: 'Failed to parse API response',
          runId: undefined
        };
      }

      // Check if this is actually a success response with a different structure
      if (response.status === 200 && result && (result.message === 'SUCCESS' || result.status === 'SUCCESS')) {
        console.error(`[XDP API] Detected success response with message format`);
        const runId = result.data?.id || result.id;
        if (runId) {
          console.error(`[XDP API] Extracted runId from alternative format: ${runId}`);
          // Continue with success flow
        } else {
          console.error(`[XDP API] SUCCESS response but no runId found`);
          return {
            success: false,
            error: 'Job submitted successfully but no run ID returned',
            runId: undefined
          };
        }
      } else if (!result.success || !result.data?.success) {
        console.error(`[XDP API] Response indicates failure - result.success: ${result.success}, result.data?.success: ${result.data?.success}`);
        return {
          success: false,
          error: result.data?.message || result.message || 'Execution failed',
          runId: result.data?.id?.toString()
        };
      }

      const runId = result.data?.id?.toString();
      console.error(`[XDP API] Adhoc run started successfully with runId: ${runId}`);

      // Wait 10 seconds for execution to start, then start listening to SSE logs
      console.error(`[XDP API] Waiting 10 seconds before starting log collection...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      console.error(`[XDP API] 10 second wait completed, starting log collection...`);

      let logs = '';
      try {
        console.error(`[XDP API] Starting SSE log stream for runId: ${runId}`);
        logs = await this.listenToSSELogs(runId);
      } catch (logError) {
        console.error('[XDP API] Could not fetch logs:', logError);
        logs = 'Logs are being generated. Check the Bolt.DIY interface for real-time logs.';
      }

      const returnValue = {
        success: true,
        runId: runId,
        status: result.data?.data?.status || 'STARTED',
        logs: logs || 'Execution started successfully. Check logs panel for details.'
      };
      
      console.error(`[XDP API] Returning success result:`, JSON.stringify(returnValue, null, 2));
      return returnValue;

    } catch (error) {
      console.error('[XDP API] Failed to execute adhoc run:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Listen to SSE log stream and collect logs until completion
   */
  private async listenToSSELogs(runId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `${this.config.baseUrl}/job/run/logs/${runId}/sse?tailLines=100`;
      console.error(`[XDP API] SSE URL: ${url}`);
      
      let collectedLogs = '';
      let completed = false;

      // Set a maximum timeout for log collection (5 minutes)
      const maxTimeout = setTimeout(() => {
        console.error('[XDP API] SSE log collection timeout reached (1 minutes)');
        completed = true;
        resolve(collectedLogs || 'Log collection timed out after 1 minutes');
      }, 60 * 1000);

      // Create SSE request
      const sseRequest = this.client.get(url, {
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        responseType: 'stream',
        timeout: 6 * 60 * 1000, // 6 minute timeout
      });

      sseRequest.then(response => {
        console.error('[XDP API] SSE connection established');
        
        response.data.on('data', (chunk: Buffer) => {
          if (completed) return;

          const data = chunk.toString();
          console.error('[XDP API] SSE chunk received:', data);
          
          // Parse SSE format
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const logData = line.substring(6).trim();
              
              if (logData === '[DONE]' || logData.includes('COMPLETED') || logData.includes('FINISHED')) {
                console.error('[XDP API] SSE stream completed');
                completed = true;
                clearTimeout(maxTimeout);
                resolve(collectedLogs);
                return;
              }
              
              if (logData && logData !== '') {
                collectedLogs += logData + '\n';
                console.error('[XDP API] Log line:', logData);
              }
            }
          }
        });

        response.data.on('end', () => {
          console.error('[XDP API] SSE stream ended');
          if (!completed) {
            completed = true;
            clearTimeout(maxTimeout);
            resolve(collectedLogs || 'Stream ended without completion signal');
          }
        });

        response.data.on('error', (error: Error) => {
          console.error('[XDP API] SSE stream error:', error);
          if (!completed) {
            completed = true;
            clearTimeout(maxTimeout);
            reject(error);
          }
        });

      }).catch(error => {
        console.error('[XDP API] Failed to establish SSE connection:', error);
        clearTimeout(maxTimeout);
        reject(error);
      });
    });
  }
}