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


}