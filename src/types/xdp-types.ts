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

// Dataplane Types
export interface Dataplane {
  id: number;
  name: string;
  url: string;
  externalUrl: string;
  description: string;
  tenantId: string;
  type: string;
  status: string;
  statusReportInterval: number;
  version: string;
  lastStatusReportTime: number | null;
  healthReport: string | null;
  registryUrl: string;
  registryPrefix: string;
  namespace: string;
  installationType: string | null;
  dataplaneVersion: string | null;
  isInternalCall: boolean;
  isRequestSentByDataplane: boolean;
  dataplaneProperties: any | null;
}

export interface ListDataplanesResponse {
  dataplanes: Dataplane[];
  pagination: {
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

export interface XDPDataplanesApiResponse {
  dataplanes: Dataplane[];
  meta: {
    size: number;
    page: number;
    count: number;
  };
}

// Execution parameters for execute_and_monitor tool
export interface ExecuteAndMonitorParams {
  sessionId: string;
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
  isManualTrigger?: boolean;
}

// Job Type enum for adhoc runs
export enum JobType {
  SPARK = 'SPARK',
  PYTHON = 'Python',
  JAVA = 'Java'
}

// Adhoc Run Request Body interface
export interface AdhocRunRequestBody {
  dataplaneId: number | string;
  jobType: JobType | string;
  description?: string;
  name?: string;
  executionConfig: {
    jobType: JobType | string;
    image: string;
    imagePullSecrets: string[];
    imagePullPolicy: string;
    codeSource: {
      type: 'MINIO' | string;
      config: {
        url: string;
        additionalParams?: unknown;
      };
    };
    stages: string[];
    type: 'Python' | 'Java' | string;
    mode: 'cluster' | string;
    driver: {
      cores: number;
      memory: string;
      memoryOverhead: string;
    };
    executor: {
      instances?: number;
      cores: number;
      memory: string;
      memoryOverhead: string;
    };
    dynamicAllocation: {
      enabled: boolean;
      initialExecutors: number;
      minExecutors: number;
      maxExecutors: number;
      shuffleTrackingTimeout?: number;
    };
    depends: {
      dataStores: Array<{ dataStoreId?: number }>;
    };
    sparkConf: Record<string, any>;
    timeToLiveSeconds?: number | null;
  };
}

// Parameters for adhoc run execution
export interface AdhocRunParams {
  dataplaneId: number | string;
  jobType: JobType | string;
  description?: string;
  name?: string;
  image: string;
  imagePullSecrets: string[];
  imagePullPolicy: string;
  codeSourceType: 'MINIO' | string;
  codeSourceUrl: string;
  codeSourceAdditionalParams?: unknown;
  stages: string[];
  executionType: 'Python' | 'Java' | string;
  executionMode: 'cluster' | string;
  driverCores: number;
  driverMemory: string;
  driverMemoryOverhead: string;
  executorInstances?: number;
  executorCores: number;
  executorMemory: string;
  executorMemoryOverhead: string;
  dynamicAllocationEnabled: boolean;
  dynamicAllocationInitial: number;
  dynamicAllocationMin: number;
  dynamicAllocationMax: number;
  dynamicAllocationShuffleTimeout?: number;
  dataStoreIds?: number[];
  sparkConf: Record<string, any>;
  timeToLiveSeconds?: number | null;
}