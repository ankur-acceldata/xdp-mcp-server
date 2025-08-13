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
//# sourceMappingURL=xdp-types.d.ts.map