# MCP Server Testing Guide

## 🔄 Why No curl for MCP?

MCP (Model Context Protocol) servers use **JSON-RPC over stdin/stdout** (stdio transport), not HTTP. This means:

- ❌ **No HTTP endpoints** - can't use curl
- ✅ **stdio communication** - JSON messages via stdin/stdout  
- ✅ **JSON-RPC protocol** - structured request/response format

## 🧪 Testing Methods

### 1. Automated Test Script
```bash
# Full test with formatted output
node test-mcp-server.js
```

### 2. Simple JSON-RPC Test  
```bash
# Shows exact request/response format
node test-simple.js
```

### 3. Manual Testing (curl-equivalent)
```bash
# Manual pipe-based testing
./test-manual.sh
```

### 4. Direct Commands

#### Test Server Startup
```bash
export XDP_ACCESS_KEY="ZUDOSEQZQEKQCTJ"
export XDP_SECRET_KEY="TY2C51SAU3CHUALOVDY4JEOYGFCSM0"
timeout 3s node dist/index.js
```

#### Test Single Request
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

#### Test Tool Call
```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"xdp_list_datastores","arguments":{"size":2}}}' | node dist/index.js
```

## 📋 JSON-RPC Request Format

### List Available Tools
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

### Call XDP Tool
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "xdp_list_datastores",
    "arguments": {
      "page": 0,
      "size": 3,
      "sortBy": "updatedAt:desc"
    }
  }
}
```

## 📥 Expected Response Format

### Tools List Response
```json
{
  "result": {
    "tools": [
      {
        "name": "xdp_list_datastores",
        "description": "List all data stores from XDP platform with pagination support",
        "inputSchema": {
          "type": "object",
          "properties": {
            "page": {"type": "number", "default": 0},
            "size": {"type": "number", "default": 20},
            "sortBy": {"type": "string", "default": "updatedAt:asc"}
          }
        }
      }
    ]
  },
  "jsonrpc": "2.0",
  "id": 1
}
```

### Tool Call Response
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "# XDP Data Stores\n\n**Total**: 26 datastores\n**Page**: 1 of 13\n..."
      }
    ]
  },
  "jsonrpc": "2.0",
  "id": 2
}
```

## ✅ Success Indicators

Look for these signs that the server is working:

### Server Startup
```
🚀 Initializing XDP MCP Server...
✅ XDP API client initialized
📊 Config: { baseUrl: '...', accessKey: 'ZUDO***' }
✅ XDP API connection test passed
✅ XDP MCP Server started and ready for connections
```

### Tool List Response
- Contains `xdp_list_datastores` tool
- Includes proper schema with page, size, sortBy parameters

### Tool Call Response  
- Returns formatted markdown with datastore information
- Shows actual XDP data (names like "neha-s3", "testodp")
- Includes pagination info

## 🔧 Debugging Commands

### Check Environment
```bash
echo "Access Key: $XDP_ACCESS_KEY"
echo "Secret Key: ${XDP_SECRET_KEY:0:4}***"
```

### Test XDP API Directly
```bash
curl --location 'https://demo.xdp.acceldata.tech/xdp-cp-service/api/datastore?page=0&size=1' \
--header 'accessKey: ZUDOSEQZQEKQCTJ' \
--header 'secretKey: TY2C51SAU3CHUALOVDY4JEOYGFCSM0'
```

### Validate JSON
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq .
```

## 🚨 Common Issues

### Server Won't Start
```bash
# Check Node version
node --version  # Should be 18+

# Rebuild
npm run build
```

### No Response
- Ensure proper JSON-RPC format
- Check environment variables are set
- Verify server initialization completed

### API Errors
- Test XDP API directly with curl (above)
- Check credentials are valid
- Verify network connectivity

## 🔄 Communication Flow

```
1. Client sends JSON-RPC request via stdin
   ↓
2. MCP Server receives and processes
   ↓  
3. Server calls XDP API if needed
   ↓
4. Server formats response as JSON-RPC
   ↓
5. Client receives response via stdout
```

This is exactly how Claude Desktop communicates with MCP servers!