# XDP MCP Server - Kubernetes Deployment Guide

## Overview

This guide explains how to deploy the XDP MCP Server in a Kubernetes cluster with WebSocket/HTTP support for communication with Bolt.diy and other clients.

## Architecture

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Bolt.diy Pod   │─────▶│  MCP Service     │─────▶│    XDP APIs     │
│  (Frontend App)  │  WS  │  (ClusterIP)     │ HTTP │  Trino Cluster  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
        ↓                          ↓
  [WebContainer]           [Port 8080]
  [Code Generator]         [WebSocket/HTTP]
```

## Deployment Methods

### 1. WebSocket Mode (Recommended for Bolt.diy)

The MCP server runs with WebSocket support, enabling real-time bidirectional communication:

- **Protocol**: WebSocket over HTTP
- **Port**: 8080
- **Endpoints**:
  - WebSocket: `ws://mcp-server:8080/ws`
  - HTTP API: `http://mcp-server:8080/api`
  - Health: `http://mcp-server:8080/health`
  - Ready: `http://mcp-server:8080/ready`

### 2. HTTP REST Mode (Alternative)

Pure REST API endpoints for simpler integration:

- **Protocol**: HTTP/HTTPS
- **Port**: 8080
- **Endpoints**:
  - List tools: `POST /api/tools/list`
  - Execute tool: `POST /api/tools/execute`
  - XDP datastores: `GET /api/xdp/datastores`
  - Trino query: `POST /api/trino/query`

## Prerequisites

1. Kubernetes cluster (1.19+)
2. kubectl configured
3. Docker registry access
4. XDP API credentials
5. Trino cluster access (optional)

## Quick Start

### 1. Build and Push Docker Image

```bash
# Build the Docker image
docker build -t xdp-mcp-server:latest .

# Tag for your registry
docker tag xdp-mcp-server:latest <your-registry>/xdp-mcp-server:latest

# Push to registry
docker push <your-registry>/xdp-mcp-server:latest
```

### 2. Create Namespace

```bash
kubectl create namespace mcp-server
```

### 3. Configure Secrets

Create a secret with your XDP credentials:

```bash
kubectl create secret generic xdp-mcp-secrets \
  --namespace=mcp-server \
  --from-literal=XDP_ACCESS_KEY='your-access-key' \
  --from-literal=XDP_SECRET_KEY='your-secret-key'
```

### 4. Configure ConfigMap

Update the ConfigMap with your environment settings:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: xdp-mcp-config
  namespace: mcp-server
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  XDP_BASE_URL: "https://your-xdp-api.example.com"
  PORT: "8080"
EOF
```

### 5. Deploy the Application

```bash
# Apply all Kubernetes manifests
kubectl apply -f k8s/
```

### 6. Verify Deployment

```bash
# Check pod status
kubectl get pods -n mcp-server

# Check service
kubectl get svc -n mcp-server

# Check logs
kubectl logs -n mcp-server -l app.kubernetes.io/name=xdp-mcp-server

# Test health endpoint
kubectl port-forward -n mcp-server svc/xdp-mcp-server 8080:8080
curl http://localhost:8080/health
```

## Integration with Bolt.diy

### 1. Environment Configuration

In your Bolt.diy deployment, set the following environment variables:

```yaml
env:
  - name: MCP_SERVER_URL
    value: "ws://xdp-mcp-server.mcp-server.svc.cluster.local:8080/ws"
  - name: MCP_AUTH_TOKEN
    valueFrom:
      secretKeyRef:
        name: bolt-secrets
        key: MCP_AUTH_TOKEN
```

### 2. Client Implementation

In Bolt.diy's `mcpService.ts`, use the WebSocket client:

```typescript
import { MCPWebSocketClient } from './mcp-websocket-client';

const mcpClient = new MCPWebSocketClient({
  url: process.env.MCP_SERVER_URL || 'ws://localhost:8080/ws',
  authToken: process.env.MCP_AUTH_TOKEN,
  reconnectInterval: 5000,
  maxReconnectAttempts: 10
});

// Connect to MCP server
await mcpClient.connect();

// List available tools
const tools = await mcpClient.listTools();

// Execute a tool
const result = await mcpClient.executeTool('xdp_list_datastores', {
  page: 0,
  size: 20
});
```

### 3. Cross-Namespace Communication

If Bolt.diy is in a different namespace:

```yaml
# Create a Service for cross-namespace access
apiVersion: v1
kind: Service
metadata:
  name: xdp-mcp-server-external
  namespace: bolt-namespace
spec:
  type: ExternalName
  externalName: xdp-mcp-server.mcp-server.svc.cluster.local
  ports:
  - port: 8080
```

## Advanced Configuration

### 1. Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: xdp-mcp-server-hpa
  namespace: mcp-server
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: xdp-mcp-server
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 2. Ingress Configuration

For external access (optional):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: xdp-mcp-server-ingress
  namespace: mcp-server
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/websocket-services: "xdp-mcp-server"
spec:
  ingressClassName: nginx
  rules:
  - host: mcp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: xdp-mcp-server
            port:
              number: 8080
```

### 3. Network Policy

Restrict traffic to MCP server:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: xdp-mcp-server-netpol
  namespace: mcp-server
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: xdp-mcp-server
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: bolt-namespace
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443  # HTTPS for XDP API
    - protocol: TCP
      port: 8080  # Trino
```

## Monitoring

### 1. Prometheus Metrics

The server exposes metrics at `/metrics`:

```yaml
# ServiceMonitor for Prometheus Operator
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: xdp-mcp-server
  namespace: mcp-server
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: xdp-mcp-server
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

### 2. Logging

View logs with:

```bash
# All logs
kubectl logs -n mcp-server -l app.kubernetes.io/name=xdp-mcp-server

# Follow logs
kubectl logs -n mcp-server -l app.kubernetes.io/name=xdp-mcp-server -f

# Specific pod
kubectl logs -n mcp-server xdp-mcp-server-<pod-id>
```

## Troubleshooting

### Connection Issues

1. **WebSocket Connection Fails**
   ```bash
   # Check service endpoints
   kubectl get endpoints -n mcp-server
   
   # Test connectivity
   kubectl run test-pod --image=curlimages/curl -it --rm -- sh
   curl http://xdp-mcp-server.mcp-server.svc.cluster.local:8080/health
   ```

2. **Session Affinity Problems**
   - Ensure `sessionAffinity: ClientIP` is set in the Service
   - Check that all pods are healthy

3. **Authentication Errors**
   - Verify XDP credentials in secrets
   - Check environment variables in pod

### Performance Issues

1. **High Latency**
   - Scale up replicas
   - Check resource limits
   - Monitor network policies

2. **Memory Issues**
   - Adjust resource limits
   - Check for memory leaks in logs
   - Enable horizontal autoscaling

### Debug Mode

Enable debug logging:

```yaml
env:
  - name: LOG_LEVEL
    value: "debug"
```

## Security Best Practices

1. **Use TLS/SSL**
   - Configure ingress with TLS certificates
   - Use `wss://` for WebSocket connections

2. **Authentication**
   - Implement JWT token validation
   - Use Kubernetes secrets for sensitive data

3. **Network Isolation**
   - Apply network policies
   - Use private endpoints where possible

4. **Resource Limits**
   - Set appropriate CPU/memory limits
   - Configure pod disruption budgets

## Migration from Stdio to WebSocket

If migrating from stdio-based MCP:

1. Update client code to use WebSocket transport
2. Configure environment variables for server URL
3. Implement reconnection logic
4. Add health checks to deployment

## Support

For issues or questions:
- Check pod logs for errors
- Verify network connectivity
- Ensure all secrets and configmaps are properly configured
- Review the health and readiness endpoints

## Example Full Deployment

```bash
# 1. Create namespace
kubectl create namespace mcp-server

# 2. Create secrets
kubectl create secret generic xdp-mcp-secrets \
  --namespace=mcp-server \
  --from-literal=XDP_ACCESS_KEY='${XDP_ACCESS_KEY}' \
  --from-literal=XDP_SECRET_KEY='${XDP_SECRET_KEY}'

# 3. Apply all resources
kubectl apply -f k8s/

# 4. Wait for rollout
kubectl rollout status deployment/xdp-mcp-server -n mcp-server

# 5. Test the deployment
kubectl port-forward -n mcp-server svc/xdp-mcp-server 8080:8080
curl http://localhost:8080/health

# 6. Check logs
kubectl logs -n mcp-server -l app.kubernetes.io/name=xdp-mcp-server --tail=100
```

## Cleanup

To remove all resources:

```bash
kubectl delete namespace mcp-server
```