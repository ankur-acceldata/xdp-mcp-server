# XDP MCP Server Testing Guide

## Quick Setup for Claude Desktop

### 1. Automatic Setup (Recommended)
```bash
# From the xdp-mcp-server directory
./setup-claude-desktop.sh
```

### 2. Manual Setup
1. **Locate Claude Desktop config**:
   ```bash
   # macOS
   open "$HOME/Library/Application Support/Claude"
   
   # Windows  
   # %APPDATA%\Claude\
   ```

2. **Create/edit `claude_desktop_config.json`**:
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

3. **Restart Claude Desktop**

## Testing the Integration

### 1. Verify Server Works Locally
```bash
# Build the project
npm run build

# Test with environment variables
export XDP_ACCESS_KEY="ZUDOSEQZQEKQCTJ"
export XDP_SECRET_KEY="TY2C51SAU3CHUALOVDY4JEOYGFCSM0"
npm run test
```

Expected output:
```
🚀 Initializing XDP MCP Server...
✅ XDP API client initialized
📊 Config: { baseUrl: '...', accessKey: 'ZUDO***' }
🔌 Starting MCP server with stdio transport...
✅ XDP API connection test passed
✅ XDP MCP Server started and ready for connections
```

### 2. Test XDP API Connectivity
```bash
# Direct API test
curl --location 'https://demo.xdp.acceldata.tech/xdp-cp-service/api/datastore?page=0&size=5' \
--header 'accessKey: ZUDOSEQZQEKQCTJ' \
--header 'secretKey: TY2C51SAU3CHUALOVDY4JEOYGFCSM0'
```

### 3. Claude Desktop Integration Test

1. **Open Claude Desktop**
2. **Start a new conversation**
3. **Try these prompts**:

#### Basic Test
```
Do you have access to XDP tools?
```

Expected: Claude should list the available XDP tools.

#### List Datastores
```
Use the XDP tools to list all data stores.
```

Expected: A formatted list of data stores with details like ID, name, type, status.

#### Paginated Request
```
Show me the first 10 data stores from XDP, sorted by name.
```

Expected: First 10 data stores sorted by name.

#### Advanced Query
```
List XDP data stores on page 2 with 5 items per page, sorted by update date descending.
```

Expected: Specific pagination with 5 items from page 2.

## Expected Responses

### Successful Response Format
```markdown
# XDP Data Stores

**Total**: 45 datastores
**Page**: 1 of 3  
**Showing**: 20 items

## Data Stores

### 1. Production HDFS Cluster
- **ID**: ds-12345
- **Type**: HDFS
- **Status**: active
- **Last Updated**: 12/13/2024, 2:30:00 PM

### 2. Analytics Snowflake
- **ID**: ds-67890
- **Type**: SNOWFLAKE  
- **Status**: active
- **Last Updated**: 12/13/2024, 1:15:00 PM
```

## Troubleshooting

### Server Not Starting
**Issue**: Server fails to initialize
```bash
# Check Node.js version (requires Node 18+)
node --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### Authentication Errors
**Issue**: `Authentication failed. Please check your access key and secret key.`

**Solutions**:
1. Verify credentials are correct
2. Check environment variables are set
3. Ensure no extra spaces in keys

### Claude Desktop Not Detecting Server
**Issue**: Claude doesn't show XDP tools

**Solutions**:
1. **Check config file location**:
   ```bash
   # macOS
   cat "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
   ```

2. **Validate JSON format**:
   ```bash
   # Use jq to validate
   cat claude_desktop_config.json | jq .
   ```

3. **Check absolute paths**:
   ```bash
   # Ensure paths are absolute, not relative
   ls -la /absolute/path/to/xdp-mcp-server/dist/index.js
   ```

4. **Restart Claude Desktop completely**:
   - Quit Claude Desktop
   - Wait 5 seconds
   - Restart Claude Desktop

### Network/API Errors  
**Issue**: `Unable to connect to XDP API`

**Solutions**:
1. **Test API directly**:
   ```bash
   curl -I https://demo.xdp.acceldata.tech/xdp-cp-service/api/datastore
   ```

2. **Check firewall/proxy settings**
3. **Verify credentials haven't expired**

### Debug Mode
**Enable detailed logging**:
```bash
# Add to environment
export DEBUG=1
export NODE_ENV=development
```

## Advanced Testing

### Custom Queries
Test the tool with various parameter combinations:

```
List data stores with these parameters:
- Page: 0
- Size: 5  
- Sort: updatedAt:desc
```

### Error Handling
Test error scenarios:

```
List data stores from page 1000 (should handle gracefully)
```

### Performance Testing
Test with larger page sizes:

```
Show me 50 data stores from XDP (test larger page size)
```

## Logs and Debugging

### Claude Desktop Logs
**macOS**:
```bash
# Open Console app and search for "Claude"
open /Applications/Utilities/Console.app
```

**Windows**:
```
# Check Event Viewer or Claude logs directory
```

### Server Logs
The MCP server logs to stderr, which Claude Desktop captures:
- `🚀` Initialization
- `✅` Success operations  
- `❌` Errors
- `📊` API calls
- `🔧` Tool executions

## Next Steps

Once basic testing works:

1. **Add more tools** (Spark context, Trino queries)
2. **Implement caching** for better performance  
3. **Add error recovery** and retry logic
4. **Create bolt.diy integration**

## Support

If you encounter issues:

1. **Check this guide** for common solutions
2. **Review server logs** for specific errors
3. **Test API connectivity** independently  
4. **Verify Claude Desktop config** format and paths