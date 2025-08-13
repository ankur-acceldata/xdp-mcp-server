# Quick Test Guide

## ✅ Server Status
- **API Connection**: Working (26 datastores available)
- **Authentication**: Valid credentials configured
- **Claude Desktop**: Configuration updated and ready

## 🚀 Test in Claude Desktop

1. **Restart Claude Desktop** (important!)
2. **Start a new conversation**
3. **Try these prompts**:

### Basic Test
```
Do you have access to XDP tools?
```

### List Datastores
```
List all data stores from XDP
```

### Specific Query
```
Show me the first 5 data stores from XDP, sorted by update date
```

## 📊 Expected Output Format

```markdown
# XDP Data Stores

**Total**: 26 datastores
**Page**: 1 of 6
**Showing**: 5 items

## Data Stores

### 1. neha-s3
- **ID**: 129
- **Type**: S3
- **Dataplane ID**: 168
- **Tenant**: demo
- **Credentials Configured**: ✅ Yes
- **URL**: s3://nehaspark
- **Last Updated**: 8/11/2025, 1:03:16 PM

### 2. neha-xdp-odp
- **ID**: 135
- **Type**: ODP
- **Dataplane ID**: 168
- **Tenant**: demo
- **Credentials Configured**: ✅ Yes
- **URL**: hdfs://qenamenode1:8020
- **Last Updated**: 8/7/2025, 11:18:14 AM
```

## 🔧 Available Parameters

The `xdp_list_datastores` tool accepts:
- `page`: Page number (0-based, default: 0)
- `size`: Items per page (1-100, default: 20)  
- `sortBy`: Sort field (default: "updatedAt:asc")

## 🚨 If Issues Occur

1. **Check Claude Desktop logs**:
   - Open Console.app
   - Search for "Claude"
   - Look for MCP-related errors

2. **Verify server works**:
   ```bash
   npm run test
   ```

3. **Re-run setup**:
   ```bash
   ./setup-claude-desktop.sh
   ```

The server is working correctly and ready for testing!