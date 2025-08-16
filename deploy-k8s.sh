#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="mcp-server"
CONTEXT="${KUBE_CONTEXT:-}"
DRY_RUN=false
SKIP_SECRETS=false

# Parse command line arguments
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --context=*)
            CONTEXT="${arg#*=}"
            shift
            ;;
        --namespace=*)
            NAMESPACE="${arg#*=}"
            shift
            ;;
        --skip-secrets)
            SKIP_SECRETS=true
            shift
            ;;
        --help)
            echo "Usage: ./deploy-k8s.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run           Show what would be deployed without applying"
            echo "  --context=CONTEXT   Kubernetes context to use"
            echo "  --namespace=NS      Kubernetes namespace (default: mcp-server)"
            echo "  --skip-secrets      Skip secret creation (assume they exist)"
            echo "  --help              Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  KUBE_CONTEXT        Kubernetes context"
            echo "  XDP_ACCESS_KEY      XDP access key for secret creation"
            echo "  XDP_SECRET_KEY      XDP secret key for secret creation"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $arg${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Deploying XDP MCP Server to Kubernetes${NC}"
echo -e "${GREEN}==========================================${NC}"
echo -e "${BLUE}Namespace: ${NAMESPACE}${NC}"
echo -e "${BLUE}Context: ${CONTEXT:-default}${NC}"
echo -e "${BLUE}Dry run: ${DRY_RUN}${NC}"
echo ""

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}kubectl is not installed. Please install kubectl first.${NC}"
    exit 1
fi

# Set kubectl context if provided
if [ -n "$CONTEXT" ]; then
    echo -e "${YELLOW}Switching to context: ${CONTEXT}${NC}"
    kubectl config use-context "$CONTEXT"
fi

# Check if we're connected to a cluster
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Cannot connect to Kubernetes cluster. Please check your kubeconfig.${NC}"
    exit 1
fi

echo -e "${BLUE}Connected to cluster:${NC}"
kubectl cluster-info | head -1

# Dry run function
apply_manifest() {
    local file=$1
    local description=$2
    
    echo -e "${YELLOW}${description}...${NC}"
    if [ "$DRY_RUN" = true ]; then
        kubectl apply -f "$file" --dry-run=client -o yaml
    else
        kubectl apply -f "$file"
    fi
}

# Create namespace
echo -e "${YELLOW}Creating namespace...${NC}"
if [ "$DRY_RUN" = true ]; then
    kubectl apply -f k8s/namespace.yaml --dry-run=client
else
    kubectl apply -f k8s/namespace.yaml
fi

# Create secrets if not skipping
if [ "$SKIP_SECRETS" = false ]; then
    echo ""
    echo -e "${YELLOW}Creating secrets...${NC}"
    
    if [ -z "$XDP_ACCESS_KEY" ] || [ -z "$XDP_SECRET_KEY" ]; then
        echo -e "${YELLOW}XDP_ACCESS_KEY and XDP_SECRET_KEY environment variables not set.${NC}"
        echo -e "${YELLOW}Creating secret using kubectl command...${NC}"
        
        if [ "$DRY_RUN" = false ]; then
            echo ""
            echo -e "${BLUE}Please run the following command with your actual credentials:${NC}"
            echo -e "${YELLOW}kubectl create secret generic xdp-mcp-secrets \\${NC}"
            echo -e "${YELLOW}  --from-literal=XDP_ACCESS_KEY=your-access-key \\${NC}"
            echo -e "${YELLOW}  --from-literal=XDP_SECRET_KEY=your-secret-key \\${NC}"
            echo -e "${YELLOW}  --namespace=${NAMESPACE}${NC}"
            echo ""
            read -p "Press Enter after creating the secret manually, or Ctrl+C to exit..."
        fi
    else
        if [ "$DRY_RUN" = true ]; then
            echo "kubectl create secret generic xdp-mcp-secrets --from-literal=XDP_ACCESS_KEY=*** --from-literal=XDP_SECRET_KEY=*** --namespace=${NAMESPACE} --dry-run=client"
        else
            kubectl create secret generic xdp-mcp-secrets \
                --from-literal=XDP_ACCESS_KEY="$XDP_ACCESS_KEY" \
                --from-literal=XDP_SECRET_KEY="$XDP_SECRET_KEY" \
                --namespace="$NAMESPACE" \
                --dry-run=client -o yaml | kubectl apply -f -
        fi
    fi
else
    echo -e "${YELLOW}Skipping secret creation...${NC}"
fi

echo ""

# Deploy manifests
apply_manifest "k8s/configmap.yaml" "Creating ConfigMap"
apply_manifest "k8s/deployment.yaml" "Creating Deployment"
apply_manifest "k8s/service.yaml" "Creating Service"
apply_manifest "k8s/hpa.yaml" "Creating HorizontalPodAutoscaler"

# Optional: Deploy ingress (commented out by default)
echo ""
echo -e "${YELLOW}Ingress configuration is available in k8s/ingress.yaml${NC}"
echo -e "${YELLOW}Update the host and TLS settings, then apply manually:${NC}"
echo -e "${BLUE}kubectl apply -f k8s/ingress.yaml${NC}"

if [ "$DRY_RUN" = false ]; then
    echo ""
    echo -e "${GREEN}Deployment completed!${NC}"
    echo ""
    echo -e "${BLUE}Checking deployment status...${NC}"
    kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=xdp-mcp-server
    
    echo ""
    echo -e "${BLUE}Services:${NC}"
    kubectl get services -n "$NAMESPACE"
    
    echo ""
    echo -e "${GREEN}Useful commands:${NC}"
    echo -e "${YELLOW}View pods:${NC} kubectl get pods -n $NAMESPACE"
    echo -e "${YELLOW}View logs:${NC} kubectl logs -f deployment/xdp-mcp-server -n $NAMESPACE"
    echo -e "${YELLOW}Port forward:${NC} kubectl port-forward service/xdp-mcp-server-service 3000:3000 -n $NAMESPACE"
    echo -e "${YELLOW}Delete deployment:${NC} kubectl delete namespace $NAMESPACE"
    
    echo ""
    echo -e "${GREEN}Waiting for pods to be ready...${NC}"
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=xdp-mcp-server -n "$NAMESPACE" --timeout=300s
    
    echo -e "${GREEN}All pods are ready!${NC}"
else
    echo ""
    echo -e "${GREEN}Dry run completed. No changes were made.${NC}"
fi