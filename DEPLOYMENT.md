# XDP MCP Server - Kubernetes Deployment Guide

This guide provides step-by-step instructions for deploying the XDP MCP Server to a Kubernetes cluster.

## Prerequisites

- Docker installed locally
- kubectl configured with access to your Kubernetes cluster
- Access to a container registry (Docker Hub, GHCR, ECR, etc.)
- XDP access credentials

## Quick Start

### 1. Build and Push Docker Image

```bash
# Set your container registry
export REGISTRY="your-registry.com/username"  # e.g., ghcr.io/username

# Build and push image
./build-image.sh --push --registry=$REGISTRY
```

### 2. Configure Secrets

```bash
# Set your XDP credentials
export XDP_ACCESS_KEY="your-access-key"
export XDP_SECRET_KEY="your-secret-key"
```

### 3. Update Deployment Configuration

Edit `k8s/deployment.yaml` and update the image name:
```yaml
image: your-registry.com/username/xdp-mcp-server:latest
```

### 4. Deploy to Kubernetes

```bash
# Deploy all components
./deploy-k8s.sh
```

## Detailed Instructions

### Building the Docker Image

The `build-image.sh` script provides several options:

```bash
# Basic build (local only)
./build-image.sh

# Build and push to registry
./build-image.sh --push --registry=ghcr.io/username

# Multi-architecture build (for ARM and x86)
./build-image.sh --multi-arch --registry=ghcr.io/username

# Build with custom tag
./build-image.sh --push --tag=v1.0.0 --registry=ghcr.io/username

# Build without cache
./build-image.sh --no-cache --push
```

### Manual Image Build

If you prefer to build manually:

```bash
# Build the image
docker build -t xdp-mcp-server:latest .

# Tag for your registry
docker tag xdp-mcp-server:latest your-registry.com/username/xdp-mcp-server:latest

# Push to registry
docker push your-registry.com/username/xdp-mcp-server:latest
```

### Kubernetes Deployment

#### Option 1: Using the Deployment Script

```bash
# Basic deployment
./deploy-k8s.sh

# Dry run to see what will be deployed
./deploy-k8s.sh --dry-run

# Deploy to specific namespace
./deploy-k8s.sh --namespace=my-namespace

# Skip secret creation (if secrets already exist)
./deploy-k8s.sh --skip-secrets

# Use specific kubectl context
./deploy-k8s.sh --context=prod-cluster
```

#### Option 2: Manual Deployment

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets
kubectl create secret generic xdp-mcp-secrets \
  --from-literal=XDP_ACCESS_KEY=your-access-key \
  --from-literal=XDP_SECRET_KEY=your-secret-key \
  --namespace=mcp-server

# Deploy configuration and application
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml

# Optional: Deploy ingress (update host first)
kubectl apply -f k8s/ingress.yaml
```

## Configuration

### Environment Variables

Configure the application using the ConfigMap in `k8s/configmap.yaml`:

```yaml
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"          # debug, info, warn, error
  XDP_BASE_URL: "https://dev-api.xdp.acceldata.dev"
```

### Resource Limits

Adjust resource requests and limits in `k8s/deployment.yaml`:

```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### Scaling

The deployment includes Horizontal Pod Autoscaler (HPA):
- **Min replicas**: 2
- **Max replicas**: 10
- **CPU target**: 70%
- **Memory target**: 80%

To modify scaling behavior, edit `k8s/hpa.yaml`.

### External Access

#### Option 1: Port Forward (Development)
```bash
kubectl port-forward service/xdp-mcp-server-service 3000:3000 -n mcp-server
```

#### Option 2: LoadBalancer Service
Uncomment the LoadBalancer service in `k8s/service.yaml` or apply it separately.

#### Option 3: Ingress
1. Update `k8s/ingress.yaml` with your domain and ingress controller settings
2. Apply the ingress: `kubectl apply -f k8s/ingress.yaml`

## Monitoring and Troubleshooting

### Check Deployment Status

```bash
# Check pods
kubectl get pods -n mcp-server

# Check services
kubectl get services -n mcp-server

# Check ingress (if deployed)
kubectl get ingress -n mcp-server

# Check HPA status
kubectl get hpa -n mcp-server
```

### View Logs

```bash
# View all pod logs
kubectl logs -f deployment/xdp-mcp-server -n mcp-server

# View specific pod logs
kubectl logs -f pod-name -n mcp-server

# View previous container logs
kubectl logs pod-name -n mcp-server --previous
```

### Debug Pod Issues

```bash
# Describe deployment
kubectl describe deployment xdp-mcp-server -n mcp-server

# Describe pod
kubectl describe pod pod-name -n mcp-server

# Get events
kubectl get events -n mcp-server --sort-by='.lastTimestamp'

# Shell into pod
kubectl exec -it pod-name -n mcp-server -- sh
```

### Health Checks

The deployment includes liveness and readiness probes that check if the Node.js process is running.

## Security Considerations

- Pods run as non-root user (UID 1001)
- Read-only root filesystem
- Security capabilities dropped
- Resource limits enforced
- Secrets managed separately from configuration

## Cleanup

To remove the entire deployment:

```bash
# Delete all resources
kubectl delete namespace mcp-server

# Or delete individual components
kubectl delete -f k8s/ -n mcp-server
```

## Container Registry Examples

### GitHub Container Registry (GHCR)
```bash
# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u username --password-stdin

# Build and push
./build-image.sh --push --registry=ghcr.io/username
```

### AWS ECR
```bash
# Login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build and push
./build-image.sh --push --registry=123456789012.dkr.ecr.us-east-1.amazonaws.com
```

### Google Container Registry (GCR)
```bash
# Login
gcloud auth configure-docker

# Build and push
./build-image.sh --push --registry=gcr.io/project-id
```

## Production Considerations

1. **Image Security**: Regularly scan images for vulnerabilities
2. **Resource Monitoring**: Set up monitoring for CPU, memory, and network usage
3. **Log Aggregation**: Configure centralized logging (ELK, Fluentd, etc.)
4. **Backup**: Regular backup of persistent data if any
5. **TLS**: Configure TLS termination at ingress or load balancer
6. **Network Policies**: Implement network policies for additional security
7. **Pod Security Standards**: Apply pod security standards/policies

## Support

For issues and questions:
- Check the application logs first
- Review Kubernetes events
- Verify configuration and secrets
- Check network connectivity to XDP platform