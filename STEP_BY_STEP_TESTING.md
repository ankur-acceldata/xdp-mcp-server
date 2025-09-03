# Step-by-Step Testing Guide

## ✅ TypeScript Issues Fixed!

The compilation errors have been resolved. Here's how to test step by step:

## Step 1: Start MCP Server in Container

### Option A: Use Different Port (Recommended)
```bash
cd /Users/ankuragarwal/src/xdp-mcp-server

# Create .env if not exists
cp .env.example .env
# Edit .env and add your XDP credentials

# Start on port 8081 to avoid conflicts
docker run -d \
  --name mcp-server-test \
  -p 8081:8080 \
  -e XDP_ACCESS_KEY=$XDP_ACCESS_KEY \
  -e XDP_SECRET_KEY=$XDP_SECRET_KEY \
  -e LOG_LEVEL=debug \
  xdp-mcp-server-xdp-mcp-server:latest

# Check if it's running
curl http://localhost:8081/health
```

### Option B: Stop Conflicting Process
```bash
# Find what's using port 8080
sudo lsof -i :8080

# Kill the process (replace PID with actual)
sudo kill -9 <PID>

# Then start normally
docker-compose up -d
```

## Step 2: Test MCP Server Endpoints

### HTTP Health Check
```bash
# Basic health check
curl http://localhost:8081/health

# Expected response:
# {"status":"healthy","timestamp":"2024-01-15T10:00:00.000Z","sessions":0}
```

### WebSocket Connection Test
```bash
# Install WebSocket test tool
npm install -g wscat

# Test WebSocket connection
wscat -c ws://localhost:8081/ws

# Send test messages:
> {"type": "ping"}
> {"type": "list_tools"}
> {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
```

### HTTP API Test
```bash
# List tools via HTTP
curl -X POST http://localhost:8081/api/tools/list \
  -H "Content-Type: application/json" \
  -d '{}'

# List datastores
curl "http://localhost:8081/api/xdp/datastores?page=0&size=5"

# Execute tool via HTTP
curl -X POST http://localhost:8081/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "xdp_list_datastores",
    "params": {"page": 0, "size": 3}
  }'
```

## Step 3: Connect Bolt.diy Locally

### Setup Bolt.diy
```bash
cd /Users/ankuragarwal/src/bolt.diy

# Set MCP server URL
export MCP_SERVER_URL=ws://localhost:8081/ws
export MCP_API_URL=http://localhost:8081/api

# Start Bolt.diy in development mode
pnpm run dev
```

### Update Bolt.diy MCP Configuration

Edit `bolt.diy/app/lib/services/mcpService.ts` or create a new config:

```typescript
// In bolt.diy/app/lib/xdp-mcp-config.ts
export const mcpConfig = {
  serverUrl: process.env.MCP_SERVER_URL || 'ws://localhost:8081/ws',
  httpUrl: process.env.MCP_API_URL || 'http://localhost:8081/api',
  reconnectInterval: 5000,
  maxReconnectAttempts: 10
};
```

### Test Connection from Bolt.diy

Create a test page in Bolt.diy to verify connection:

```typescript
// bolt.diy/app/routes/test-mcp.tsx
import { useEffect, useState } from 'react';

export default function TestMCP() {
  const [status, setStatus] = useState('Not connected');
  const [tools, setTools] = useState([]);

  useEffect(() => {
    // Test HTTP connection first
    fetch('http://localhost:8081/health')
      .then(res => res.json())
      .then(data => {
        console.log('Health check:', data);
        setStatus('HTTP connection successful');
        
        // Test tools list
        return fetch('http://localhost:8081/api/tools/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
      })
      .then(res => res.json())
      .then(data => {
        console.log('Tools:', data);
        setTools(data.tools || []);
        setStatus('MCP tools loaded successfully');
      })
      .catch(err => {
        console.error('MCP test failed:', err);
        setStatus('Connection failed: ' + err.message);
      });
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>MCP Server Test</h1>
      <p>Status: {status}</p>
      <h2>Available Tools:</h2>
      <ul>
        {tools.map((tool: any) => (
          <li key={tool.name}>
            <strong>{tool.name}</strong>: {tool.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Step 4: Test End-to-End Workflow

### Test Data Store Listing
```bash
# From command line
curl -X POST http://localhost:8081/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "xdp_list_datastores",
    "params": {
      "page": 0,
      "size": 5,
      "sortBy": "updatedAt:desc"
    }
  }'
```

### Test WebSocket with Advanced Client
```bash
cd /Users/ankuragarwal/src/xdp-mcp-server

# Run the test client
cd test && npm install ws node-fetch
node test-websocket.js

# Interactive commands:
# 1 - Test ping
# 2 - List tools
# 3 - List datastores
# 4 - List catalogs (need dataplane ID)
# 5 - Custom JSON message
# 6 - Exit
```

### Test Bolt.diy Integration
```bash
# Run the integration test simulation
cd /Users/ankuragarwal/src/xdp-mcp-server/test
node bolt-integration-test.js

# This simulates the full Bolt.diy workflow
```

## Step 5: Test Code Generation Workflow

### Simulate User Request in Bolt.diy
1. User asks: "Create a PySpark application to deduplicate data in a Snowflake table"
2. Bolt.diy should:
   - Connect to MCP server
   - List available tools
   - Execute `xdp_list_datastores` to show available data sources
   - Execute `trino_list_catalogs` to show Snowflake catalogs
   - Generate code based on the schema information

### Test the Full Flow
```bash
# Start MCP server
docker run -d --name mcp-test -p 8081:8080 \
  -e XDP_ACCESS_KEY=$XDP_ACCESS_KEY \
  -e XDP_SECRET_KEY=$XDP_SECRET_KEY \
  xdp-mcp-server-xdp-mcp-server:latest

# Start Bolt.diy
cd /Users/ankuragarwal/src/bolt.diy
export MCP_SERVER_URL=ws://localhost:8081/ws
pnpm run dev

# Visit http://localhost:5173 and test MCP integration
```

## Step 6: Performance Testing

### Load Test HTTP Endpoints
```bash
# Install Apache Bench
brew install httpie

# Test health endpoint
ab -n 100 -c 10 http://localhost:8081/health

# Test tools listing
ab -n 50 -c 5 -p tools-request.json -T application/json http://localhost:8081/api/tools/list
```

### WebSocket Performance Test
```bash
cd /Users/ankuragarwal/src/xdp-mcp-server/test
node bolt-integration-test.js --perf
```

## Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Find process using port
lsof -i :8080

# Kill process or use different port
docker run -p 8081:8080 ...
```

#### 2. CORS Issues in Bolt.diy
Add CORS headers in bolt.diy if needed:
```typescript
// In bolt.diy, add to fetch requests:
fetch(url, {
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  }
})
```

#### 3. WebSocket Connection Fails
```bash
# Check WebSocket upgrade
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
  http://localhost:8081/ws
```

#### 4. XDP API Connection Issues
```bash
# Test from container
docker exec mcp-test curl https://dev-api.xdp.acceldata.dev/health

# Check logs
docker logs mcp-test
```

## Monitoring

### Real-time Monitoring
```bash
# Monitor health
watch -n 5 'curl -s http://localhost:8081/health | jq'

# Monitor sessions
watch -n 5 'curl -s http://localhost:8081/api/sessions | jq'

# Monitor logs
docker logs -f mcp-test
```

### Performance Metrics
```bash
# Container stats
docker stats mcp-test

# Memory usage
docker exec mcp-test cat /proc/meminfo

# Process info
docker exec mcp-test ps aux
```

## Cleanup

```bash
# Stop and remove container
docker stop mcp-test
docker rm mcp-test

# Stop docker-compose
docker-compose down -v

# Clean up images
docker image prune
```

## Advanced Testing

### Test with Mock XDP API
```bash
# Start mock server
docker-compose --profile mock up -d

# Configure MCP to use mock
docker run -p 8081:8080 \
  -e XDP_BASE_URL=http://host.docker.internal:1080 \
  -e XDP_ACCESS_KEY=mock-key \
  -e XDP_SECRET_KEY=mock-secret \
  xdp-mcp-server-xdp-mcp-server:latest
```

### Test K8s-like Environment
```bash
# Create test network
docker network create k8s-test

# Run MCP server in network
docker run -d --name mcp-server --network k8s-test \
  -e XDP_ACCESS_KEY=$XDP_ACCESS_KEY \
  xdp-mcp-server-xdp-mcp-server:latest

# Test from another container
docker run --rm --network k8s-test curlimages/curl \
  curl http://mcp-server:8080/health
```

## Success Criteria

✅ **MCP Server Health Check**: Returns 200 with healthy status
✅ **WebSocket Connection**: Can connect and exchange messages
✅ **Tool Discovery**: Can list available MCP tools
✅ **Tool Execution**: Can execute xdp_list_datastores
✅ **Bolt.diy Connection**: Can connect from Bolt.diy to MCP server
✅ **Data Retrieval**: Can fetch data from XDP API
✅ **Code Generation**: Can use retrieved data for code generation
✅ **Error Handling**: Graceful handling of connection failures
✅ **Performance**: Handles concurrent requests efficiently

## Next Steps After Local Testing

1. **Tag and Push Image**
   ```bash
   docker tag xdp-mcp-server-xdp-mcp-server:latest your-registry/xdp-mcp-server:v1.0.0
   docker push your-registry/xdp-mcp-server:v1.0.0
   ```

2. **Deploy to Kubernetes**
   ```bash
   # Update image in k8s/deployment.yaml
   kubectl apply -f k8s/
   ```

3. **Configure Bolt.diy for K8s**
   ```bash
   # Update MCP_SERVER_URL to K8s service
   export MCP_SERVER_URL=ws://xdp-mcp-server.mcp-server.svc.cluster.local:8080/ws
   ```