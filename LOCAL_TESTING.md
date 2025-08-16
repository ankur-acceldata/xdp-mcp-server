# Local Testing Guide for XDP MCP Server

This guide explains how to test the XDP MCP Server locally using Docker containers before deploying to Kubernetes.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for running test scripts)
- XDP API credentials (or use mock server)
- Git

## Quick Start

### 1. Setup Environment

```bash
# Clone the repository (if not already done)
cd /Users/ankuragarwal/src/xdp-mcp-server

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# Set XDP_ACCESS_KEY and XDP_SECRET_KEY
```

### 2. Build and Run with Docker Compose

```bash
# Build and start the MCP server
docker-compose up --build

# Or run in background
docker-compose up -d --build

# View logs
docker-compose logs -f xdp-mcp-server
```

### 3. Verify Server is Running

```bash
# Check health endpoint
curl http://localhost:8080/health

# Check readiness
curl http://localhost:8080/ready

# Expected response:
# {"status":"healthy","timestamp":"2024-01-15T10:00:00.000Z","sessions":0}
```

## Testing Approaches

### Option 1: HTTP API Testing

Use the provided test script for HTTP endpoints:

```bash
# Make script executable
chmod +x test/test-http.sh

# Run HTTP tests
./test/test-http.sh

# Run with verbose output
VERBOSE=true ./test/test-http.sh

# Include performance testing
PERF_TEST=true ./test/test-http.sh

# Test with specific dataplane
DATAPLANE_ID=your-dataplane-id ./test/test-http.sh
```

### Option 2: WebSocket Testing

Test WebSocket connectivity and MCP protocol:

```bash
# Install dependencies for test client
cd test
npm install ws

# Run interactive WebSocket client
node test-websocket.js

# Run automated tests
node test-websocket.js --auto
```

Interactive commands:
- `1` or `ping` - Test connectivity
- `2` or `list-tools` - List MCP tools
- `3` or `list-datastores` - List XDP datastores
- `4` or `list-catalogs` - List Trino catalogs
- `5` or `custom` - Send custom JSON
- `6` or `exit` - Close connection

### Option 3: Bolt.diy Integration Test

Simulate how Bolt.diy interacts with MCP server:

```bash
# Run Bolt.diy workflow simulation
node test/bolt-integration-test.js

# Include performance testing
node test/bolt-integration-test.js --perf
```

This test simulates:
1. Tool discovery
2. Data store listing
3. Trino catalog exploration
4. Code generation workflow
5. HTTP fallback mechanism
6. Connection resilience

## Testing with Mock XDP API

If you don't have XDP credentials, use the mock server:

```bash
# Start with mock profile
docker-compose --profile mock up

# Configure .env to use mock
echo "USE_MOCK_SERVER=true" >> .env
echo "MOCK_SERVER_URL=http://mock-xdp-api:1080" >> .env

# Setup mock responses (optional)
curl -X PUT http://localhost:1080/expectation \
  -H "Content-Type: application/json" \
  -d '{
    "httpRequest": {
      "method": "GET",
      "path": "/api/v1/data-store"
    },
    "httpResponse": {
      "statusCode": 200,
      "body": {
        "datastores": [],
        "pagination": {
          "totalElements": 0,
          "totalPages": 0,
          "page": 0
        }
      }
    }
  }'
```

## Testing with Bolt.diy Container

### Option 1: Both in Containers

```bash
# Uncomment bolt-diy service in docker-compose.yml
# Then run both services
docker-compose up --build

# Bolt.diy will be available at http://localhost:5173
# MCP server at ws://localhost:8080/ws
```

### Option 2: Bolt.diy Local, MCP in Container

```bash
# Start only MCP server
docker-compose up xdp-mcp-server

# In bolt.diy directory
cd ../bolt.diy

# Set environment variable
export MCP_SERVER_URL=ws://localhost:8080/ws

# Run Bolt.diy
pnpm run dev
```

### Option 3: Full Integration Test

```bash
# Start both services
docker-compose up -d

# Run integration test
docker exec -it ws-test-client node /app/bolt-integration-test.js

# Check logs
docker-compose logs -f
```

## Testing Kubernetes-like Environment

### Using Docker Network

```bash
# Create a network similar to K8s
docker network create k8s-test

# Run MCP server
docker run -d \
  --name mcp-server \
  --network k8s-test \
  -p 8080:8080 \
  -e XDP_ACCESS_KEY=$XDP_ACCESS_KEY \
  -e XDP_SECRET_KEY=$XDP_SECRET_KEY \
  xdp-mcp-server:latest

# Run Bolt.diy
docker run -d \
  --name bolt-diy \
  --network k8s-test \
  -p 5173:5173 \
  -e MCP_SERVER_URL=ws://mcp-server:8080/ws \
  bolt-diy:latest

# Test connectivity between containers
docker exec bolt-diy curl http://mcp-server:8080/health
```

### Using Kind (Kubernetes in Docker)

```bash
# Create local K8s cluster
kind create cluster --name mcp-test

# Load image into Kind
kind load docker-image xdp-mcp-server:latest --name mcp-test

# Apply K8s manifests
kubectl apply -f k8s/

# Port forward for testing
kubectl port-forward -n mcp-server svc/xdp-mcp-server 8080:8080

# Test the service
curl http://localhost:8080/health
```

## Debugging

### View Container Logs

```bash
# All logs
docker-compose logs

# Follow logs
docker-compose logs -f

# Specific service
docker-compose logs xdp-mcp-server

# Last 100 lines
docker-compose logs --tail=100
```

### Enter Container Shell

```bash
# Enter running container
docker exec -it xdp-mcp-server sh

# Check process
ps aux

# Test internal connectivity
curl localhost:8080/health

# View environment
env | grep XDP
```

### Network Debugging

```bash
# List networks
docker network ls

# Inspect network
docker network inspect xdp-mcp-server_mcp-network

# Test connectivity between containers
docker exec xdp-mcp-server ping bolt-diy
```

### Common Issues and Solutions

1. **Connection Refused**
   ```bash
   # Check if container is running
   docker ps
   
   # Check port binding
   docker port xdp-mcp-server
   
   # Check firewall
   sudo iptables -L
   ```

2. **WebSocket Connection Fails**
   ```bash
   # Test with wscat
   npm install -g wscat
   wscat -c ws://localhost:8080/ws
   
   # Send test message
   > {"type": "ping"}
   ```

3. **XDP API Connection Issues**
   ```bash
   # Test from container
   docker exec xdp-mcp-server curl https://dev-api.xdp.acceldata.dev/health
   
   # Check DNS
   docker exec xdp-mcp-server nslookup dev-api.xdp.acceldata.dev
   ```

4. **Memory/CPU Issues**
   ```bash
   # Monitor resources
   docker stats
   
   # Increase limits in docker-compose.yml
   # Under service definition:
   # deploy:
   #   resources:
   #     limits:
   #       memory: 1G
   #       cpus: '1.0'
   ```

## Performance Testing

### Load Testing with Artillery

```bash
# Install Artillery
npm install -g artillery

# Create test config
cat > artillery-test.yml << EOF
config:
  target: "http://localhost:8080"
  phases:
    - duration: 60
      arrivalRate: 10
  processor: "./test/artillery-processor.js"

scenarios:
  - name: "Test MCP Tools"
    engine: "ws"
    flow:
      - send: '{"type": "ping"}'
      - think: 1
      - send: '{"type": "list_tools"}'
      - think: 2
EOF

# Run load test
artillery run artillery-test.yml
```

### Monitoring with Prometheus

```bash
# Add Prometheus to docker-compose.yml
# Then access metrics
curl http://localhost:8080/metrics
```

## Cleanup

```bash
# Stop all containers
docker-compose down

# Remove volumes
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Clean up test data
rm -rf logs/
```

## Next Steps

After successful local testing:

1. **Build production image**
   ```bash
   docker build -t xdp-mcp-server:v1.0.0 .
   docker tag xdp-mcp-server:v1.0.0 your-registry/xdp-mcp-server:v1.0.0
   docker push your-registry/xdp-mcp-server:v1.0.0
   ```

2. **Deploy to Kubernetes**
   ```bash
   # Update image in k8s/deployment.yaml
   kubectl apply -f k8s/
   ```

3. **Monitor in production**
   - Set up logging aggregation
   - Configure metrics collection
   - Set up alerts

## Troubleshooting Checklist

- [ ] Docker daemon is running
- [ ] Ports 8080 are not in use
- [ ] .env file exists with correct credentials
- [ ] Container has internet access
- [ ] XDP API is accessible
- [ ] WebSocket upgrade headers are allowed
- [ ] Sufficient memory/CPU available
- [ ] No firewall blocking connections
- [ ] Correct Node.js version in container
- [ ] All dependencies installed

## Support

For issues:
1. Check container logs
2. Verify network connectivity
3. Test with curl/wscat
4. Review environment variables
5. Check XDP API status