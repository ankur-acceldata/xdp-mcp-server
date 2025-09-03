#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="xdp-mcp-server"
REGISTRY="${REGISTRY:-}"  # Set this to your container registry
TAG="${TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64,linux/arm64}"

# Parse command line arguments
PUSH=false
BUILD_MULTI_ARCH=false
NO_CACHE=false

for arg in "$@"; do
    case $arg in
        --push)
            PUSH=true
            shift
            ;;
        --multi-arch)
            BUILD_MULTI_ARCH=true
            PUSH=true  # Multi-arch builds require push
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --tag=*)
            TAG="${arg#*=}"
            shift
            ;;
        --registry=*)
            REGISTRY="${arg#*=}"
            shift
            ;;
        --help)
            echo "Usage: ./build-image.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --push              Push image to registry after build"
            echo "  --multi-arch        Build for multiple architectures (implies --push)"
            echo "  --no-cache          Build without using cache"
            echo "  --tag=TAG           Image tag (default: latest)"
            echo "  --registry=REG      Container registry (e.g., ghcr.io/username)"
            echo "  --help              Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  REGISTRY            Container registry URL"
            echo "  TAG                 Image tag"
            echo "  PLATFORM            Target platforms (default: linux/amd64,linux/arm64)"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $arg${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Build full image name
if [ -n "$REGISTRY" ]; then
    FULL_IMAGE_NAME="${REGISTRY}/${IMAGE_NAME}:${TAG}"
else
    FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"
fi

echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}Building XDP MCP Server Docker Image${NC}"
echo -e "${GREEN}===========================================${NC}"
echo -e "${BLUE}Image name: ${FULL_IMAGE_NAME}${NC}"
echo -e "${BLUE}Platform(s): ${PLATFORM}${NC}"
echo -e "${BLUE}Multi-arch: ${BUILD_MULTI_ARCH}${NC}"
echo -e "${BLUE}Push: ${PUSH}${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if buildx is available for multi-arch builds
if [ "$BUILD_MULTI_ARCH" = true ] && ! docker buildx version &> /dev/null; then
    echo -e "${RED}Docker buildx is required for multi-arch builds.${NC}"
    exit 1
fi

# Create buildx builder if needed
if [ "$BUILD_MULTI_ARCH" = true ]; then
    echo -e "${YELLOW}Setting up buildx builder...${NC}"
    docker buildx create --name mcp-builder --use 2>/dev/null || docker buildx use mcp-builder
    docker buildx inspect --bootstrap
fi

# Build Docker image
echo -e "${YELLOW}Building Docker image...${NC}"

BUILD_ARGS=""
if [ "$NO_CACHE" = true ]; then
    BUILD_ARGS="--no-cache"
fi

if [ "$BUILD_MULTI_ARCH" = true ]; then
    # Multi-architecture build
    docker buildx build \
        --platform "$PLATFORM" \
        --target production \
        --tag "$FULL_IMAGE_NAME" \
        $BUILD_ARGS \
        --push \
        .
else
    # Single architecture build
    docker build \
        --target production \
        --tag "$FULL_IMAGE_NAME" \
        $BUILD_ARGS \
        .
    
    if [ "$PUSH" = true ]; then
        echo -e "${YELLOW}Pushing image to registry...${NC}"
        docker push "$FULL_IMAGE_NAME"
    fi
fi

echo -e "${GREEN}Build completed successfully!${NC}"
echo -e "${GREEN}Image: ${FULL_IMAGE_NAME}${NC}"

# Show image details
echo ""
echo -e "${BLUE}Image details:${NC}"
if [ "$BUILD_MULTI_ARCH" = false ]; then
    docker images "$FULL_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
fi

echo ""
echo -e "${GREEN}Next steps:${NC}"
echo -e "1. Update the image in k8s/deployment.yaml:"
echo -e "   ${YELLOW}image: ${FULL_IMAGE_NAME}${NC}"
echo -e "2. Deploy to Kubernetes:"
echo -e "   ${YELLOW}./deploy-k8s.sh${NC}"