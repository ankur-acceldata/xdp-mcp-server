/**
 * XDP API Type Definitions
 */

export interface DataStore {
  id: number;
  name: string;
  dataplaneId: number;
  dataStoreType: string;
  config: Record<string, any>;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  isCredentialConfigured: boolean;
}

export interface XDPApiResponse {
  errorCode: number;
  success: boolean;
  message: string;
  detailedMessage: string;
  data: {
    dataStores: DataStore[];
    meta: {
      size: number;
      page: number;
      count: number;
    };
  };
  meta: any;
}

export interface XDPApiConfig {
  baseUrl: string;
  accessKey: string;
  secretKey: string;
}

export interface ListDataStoresParams {
  page?: number;
  size?: number;
  sortBy?: string;
}

export interface ListDataStoresResponse {
  datastores: DataStore[];
  pagination: {
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

// Trino Query Types
export interface TrinoQueryRequest {
  engine: 'TRINO';
  dataplane: string;
  query: string;
}

export interface TrinoQueryResponse {
  id: number;
  runRequestId: string;
  queryId: string;
  error: string | null;
  status: string;
  result: {
    id: string;
    state: string | null;
    columns: Array<{
      name: string;
      type: string;
      typeSignature?: {
        rawType: string;
        arguments?: any[];
      };
    }>;
    data: any[][];
    stats?: any;
    error: string | null;
    nextUri: string | null;
    infoUri: string;
    updateType: string | null;
    warnings: any[];
    failureInfo: any | null;
  };
}

export interface TrinoExecuteParams {
  dataplane: string;
  query: string;
}