# XDP MCP Server Development Guide

## Overview

This document outlines the step-by-step approach to create a Model Context Protocol (MCP) server that integrates with XDP (eXtended Data Platform) to provide data engineering tools and capabilities.

## Project Goals

1. **Primary Goal**: Create an MCP server that can fetch data stores from XDP API
2. **Secondary Goal**: Integrate with Claude Desktop for testing
3. **Future Goal**: Integrate with bolt.diy for web-based development

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude        │    │   XDP MCP        │    │   XDP API       │
│   Desktop       │◄──►│   Server         │◄──►│   Service       │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
     (stdio)              (Node.js)              (REST API)
```

## Directory Structure

```
xdp-mcp-server/
├── mcp.md                     # This documentation
├── package.json               # Node.js dependencies
├── tsconfig.json             # TypeScript configuration  
├── src/
│   ├── index.ts              # Main MCP server entry point
│   ├── services/
│   │   └── xdp-api-client.ts # XDP API integration
│   └── types/
│       └── xdp-types.ts      # TypeScript type definitions
├── dist/                     # Compiled JavaScript (generated)
└── claude_desktop_config.json # Claude Desktop configuration
```

## Development Phases

### Phase 1: Basic MCP Server Setup
- [x] Create project structure
- [ ] Initialize Node.js project with MCP SDK
- [ ] Create basic MCP server that responds to ping
- [ ] Test with Claude Desktop

### Phase 2: XDP API Integration
- [ ] Implement XDP API client with access/secret key authentication
- [ ] Create datastore listing functionality
- [ ] Add error handling and logging

### Phase 3: MCP Tools Implementation
- [ ] Implement `list_datastores` tool
- [ ] Add response formatting and validation
- [ ] Test end-to-end with Claude Desktop

### Phase 4: Enhanced Features (Future)
- [ ] Add more XDP tools (Spark context, Trino, etc.)
- [ ] Implement caching for performance
- [ ] Add configuration management

## Authentication Approach

### XDP API Authentication
- **Method**: Access Key + Secret Key headers
- **Headers**: 
  - `accessKey: ZUDOSEQZQEKQCTJ`
  - `secretKey: TY2C51SAU3CHUALOVDY4JEOYGFCSM0`
- **Base URL**: `https://demo.xdp.acceldata.tech/xdp-cp-service/api`

### MCP Communication
- **Transport**: stdio (for Claude Desktop)
- **Protocol**: JSON-RPC over stdin/stdout

## API Endpoints to Implement

### 1. List Datastores
- **Endpoint**: `GET /datastore`
- **Query Params**: `page=0&size=20&sort_by=updatedAt:asc`
- **Response**: Paginated list of data stores

### Future Endpoints
- **Spark Context**: `GET /spark/context`
- **Trino Context**: `GET /trino/context`
- **Execute Query**: `POST /query/execute`

## MCP Tools to Implement

### 1. `xdp_list_datastores`
**Description**: Fetch and list all available data stores from XDP
**Parameters**:
- `page` (optional): Page number (default: 0)
- `size` (optional): Page size (default: 20)
- `sortBy` (optional): Sort field (default: updatedAt:asc)

**Response Format**:
```json
{
  "datastores": [
    {
      "id": "string",
      "name": "string", 
      "type": "string",
      "status": "string",
      "lastUpdated": "string"
    }
  ],
  "pagination": {
    "page": 0,
    "size": 20,
    "totalElements": 100,
    "totalPages": 5
  }
}
```

## Testing Strategy

### Claude Desktop Integration
1. **Configure Claude Desktop**: Add MCP server to Claude Desktop config
2. **Test Basic Connection**: Verify MCP server starts and responds
3. **Test Tools**: Execute `xdp_list_datastores` tool
4. **Validate Output**: Ensure proper formatting and data

### Local Development Testing
1. **Direct Execution**: Run server directly and test stdio communication
2. **API Testing**: Test XDP API calls independently
3. **Error Scenarios**: Test network failures, authentication errors

## Configuration Files

### Claude Desktop Config Location
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Example Configuration
```json
{
  "mcpServers": {
    "xdp": {
      "command": "node",
      "args": ["/absolute/path/to/xdp-mcp-server/dist/index.js"],
      "env": {
        "XDP_ACCESS_KEY": "ZUDOSEQZQEKQCTJ",
        "XDP_SECRET_KEY": "TY2C51SAU3CHUALOVDY4JEOYGFCSM0"
      }
    }
  }
}
```

## Dependencies

### Core Dependencies
- `@modelcontextprotocol/sdk`: MCP SDK for Node.js
- `axios`: HTTP client for API calls
- `typescript`: TypeScript support

### Development Dependencies
- `tsx`: TypeScript execution
- `@types/node`: Node.js type definitions

## Error Handling Strategy

### API Errors
- **Network Issues**: Retry with exponential backoff
- **Authentication Errors**: Clear error messages
- **Rate Limiting**: Respect API limits

### MCP Errors
- **Tool Execution Errors**: Return structured error responses
- **Invalid Parameters**: Validate inputs and provide helpful messages

## Security Considerations

1. **Credential Management**: Store API keys in environment variables
2. **Input Validation**: Sanitize all user inputs
3. **Error Information**: Don't leak sensitive data in error messages
4. **Network Security**: Use HTTPS for all API calls

## Development Workflow

1. **Setup**: Initialize project and install dependencies
2. **Build**: Compile TypeScript to JavaScript
3. **Test**: Run local tests and Claude Desktop integration
4. **Deploy**: Update Claude Desktop configuration
5. **Verify**: Test end-to-end functionality

## Next Steps

1. Execute Phase 1: Create basic MCP server scaffolding
2. Implement XDP API client with authentication
3. Create the first tool: `xdp_list_datastores`
4. Test with Claude Desktop
5. Iterate and add more features

## Troubleshooting Guide

### Common Issues
- **Server Won't Start**: Check Node.js version and dependencies
- **Authentication Fails**: Verify access/secret keys
- **Claude Desktop Connection**: Check config file path and format
- **No Response**: Verify stdio communication and JSON-RPC format

### Debug Commands
```bash
# Test server directly
node dist/index.js

# Check API connectivity
curl --location 'https://demo.xdp.acceldata.tech/xdp-cp-service/api/datastore' \
--header 'accessKey: ZUDOSEQZQEKQCTJ' \
--header 'secretKey: TY2C51SAU3CHUALOVDY4JEOYGFCSM0'

# Validate Claude Desktop config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq
```