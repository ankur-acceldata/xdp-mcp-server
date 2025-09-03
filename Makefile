.PHONY: help build push deploy clean logs status test-local

# Configuration
REGISTRY ?= your-registry.com/username
IMAGE_NAME ?= xdp-mcp-server
TAG ?= latest
NAMESPACE ?= mcp-server

# Colors for output
GREEN = \033[0;32m
RED = \033[0;31m
YELLOW = \033[1;33m
NC = \033[0m # No Color

help:
	@echo "XDP MCP Server - Development & Deployment Commands"
	@echo "=================================================="
	@echo ""
	@echo "$(GREEN)Local Testing:$(NC)"
	@echo "  make test-local     - Complete local test workflow"
	@echo "  make docker-up      - Start with docker-compose"
	@echo "  make docker-down    - Stop docker-compose"
	@echo "  make test-http      - Test HTTP endpoints"
	@echo "  make test-ws        - Test WebSocket (interactive)"
	@echo "  make test-all       - Run all automated tests"
	@echo "  make monitor        - Monitor server health"
	@echo ""
	@echo "$(GREEN)Docker Commands:$(NC)"
	@echo "  make build          - Build Docker image locally"
	@echo "  make push           - Build and push to registry"
	@echo "  make multi-arch     - Build and push multi-architecture image"
	@echo ""
	@echo "$(GREEN)Kubernetes Commands:$(NC)"
	@echo "  make deploy         - Deploy to Kubernetes"
	@echo "  make deploy-dry     - Dry run deployment"
	@echo "  make status         - Check deployment status"
	@echo "  make logs           - View application logs"
	@echo "  make clean          - Remove from Kubernetes"
	@echo ""
	@echo "$(YELLOW)Environment Variables:$(NC)"
	@echo "  REGISTRY           - Container registry (default: your-registry.com/username)"
	@echo "  TAG                - Image tag (default: latest)"
	@echo "  NAMESPACE          - Kubernetes namespace (default: mcp-server)"
	@echo "  XDP_ACCESS_KEY     - XDP access key for deployment"
	@echo "  XDP_SECRET_KEY     - XDP secret key for deployment"

# Docker commands
build:
	@echo "Building Docker image..."
	./build-image.sh --tag=$(TAG)

push:
	@echo "Building and pushing Docker image..."
	./build-image.sh --push --registry=$(REGISTRY) --tag=$(TAG)

multi-arch:
	@echo "Building multi-architecture image..."
	./build-image.sh --multi-arch --registry=$(REGISTRY) --tag=$(TAG)

# Kubernetes commands
deploy:
	@echo "Deploying to Kubernetes..."
	./deploy-k8s.sh --namespace=$(NAMESPACE)

deploy-dry:
	@echo "Dry run deployment..."
	./deploy-k8s.sh --dry-run --namespace=$(NAMESPACE)

status:
	@echo "Checking deployment status..."
	@kubectl get pods -n $(NAMESPACE) -l app.kubernetes.io/name=xdp-mcp-server
	@echo ""
	@kubectl get services -n $(NAMESPACE)
	@echo ""
	@kubectl get hpa -n $(NAMESPACE)

logs:
	@echo "Viewing application logs..."
	kubectl logs -f deployment/xdp-mcp-server -n $(NAMESPACE)

logs-previous:
	@echo "Viewing previous logs..."
	kubectl logs deployment/xdp-mcp-server -n $(NAMESPACE) --previous

shell:
	@echo "Opening shell in pod..."
	kubectl exec -it deployment/xdp-mcp-server -n $(NAMESPACE) -- sh

port-forward:
	@echo "Port forwarding to localhost:3000..."
	kubectl port-forward service/xdp-mcp-server-service 3000:3000 -n $(NAMESPACE)

clean:
	@echo "Removing deployment from Kubernetes..."
	kubectl delete namespace $(NAMESPACE) || true

# Development commands
dev-build:
	@echo "Building for development..."
	docker build --target builder -t $(IMAGE_NAME):dev .

dev-run:
	@echo "Running development container..."
	docker run -it --rm \
		-v $(PWD):/app \
		-p 3000:3000 \
		-e NODE_ENV=development \
		$(IMAGE_NAME):dev npm run dev

# Utility commands
update-image:
	@echo "Updating deployment image..."
	kubectl set image deployment/xdp-mcp-server xdp-mcp-server=$(REGISTRY)/$(IMAGE_NAME):$(TAG) -n $(NAMESPACE)

restart:
	@echo "Restarting deployment..."
	kubectl rollout restart deployment/xdp-mcp-server -n $(NAMESPACE)

rollback:
	@echo "Rolling back deployment..."
	kubectl rollout undo deployment/xdp-mcp-server -n $(NAMESPACE)

scale:
	@echo "Scaling deployment to $(REPLICAS) replicas..."
	kubectl scale deployment/xdp-mcp-server --replicas=$(REPLICAS) -n $(NAMESPACE)

# Secret management
create-secrets:
	@if [ -z "$(XDP_ACCESS_KEY)" ] || [ -z "$(XDP_SECRET_KEY)" ]; then \
		echo "Error: XDP_ACCESS_KEY and XDP_SECRET_KEY must be set"; \
		exit 1; \
	fi
	kubectl create secret generic xdp-mcp-secrets \
		--from-literal=XDP_ACCESS_KEY=$(XDP_ACCESS_KEY) \
		--from-literal=XDP_SECRET_KEY=$(XDP_SECRET_KEY) \
		--namespace=$(NAMESPACE) \
		--dry-run=client -o yaml | kubectl apply -f -

# Complete workflow
all: build push deploy status

# CI/CD workflow
ci: build push
cd: deploy status

# Local Testing Commands
test-local: env-check docker-up test-all docker-down ## Complete local test workflow
	@echo "$(GREEN)✓ Local testing completed successfully!$(NC)"

env-check: ## Check environment setup
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(YELLOW)⚠ Created .env file. Please add your XDP credentials.$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✓ Environment configured$(NC)"

docker-up: ## Start services with docker-compose
	@echo "$(GREEN)Starting services...$(NC)"
	docker-compose up -d --build
	@echo "Waiting for services to be ready..."
	@sleep 5
	@curl -s http://localhost:8080/health > /dev/null && echo "$(GREEN)✓ Server is healthy$(NC)" || echo "$(RED)✗ Server not responding$(NC)"

docker-down: ## Stop docker-compose services
	@echo "$(YELLOW)Stopping services...$(NC)"
	docker-compose down -v

test-http: ## Test HTTP endpoints
	@echo "$(GREEN)Testing HTTP endpoints...$(NC)"
	@chmod +x test/test-http.sh
	@./test/test-http.sh

test-ws: ## Test WebSocket interactively
	@echo "$(GREEN)Starting WebSocket test client...$(NC)"
	@cd test && npm install ws && node test-websocket.js

test-ws-auto: ## Test WebSocket automatically
	@echo "$(GREEN)Running automated WebSocket tests...$(NC)"
	@cd test && npm install ws && node test-websocket.js --auto

test-integration: ## Run Bolt.diy integration test
	@echo "$(GREEN)Running Bolt.diy integration test...$(NC)"
	@cd test && npm install ws node-fetch && node bolt-integration-test.js

test-all: test-http test-ws-auto test-integration ## Run all tests
	@echo "$(GREEN)✓ All tests completed$(NC)"

monitor: ## Monitor server health
	@while true; do \
		clear; \
		echo "=== XDP MCP Server Monitor ==="; \
		echo ""; \
		echo "Health Status:"; \
		curl -s http://localhost:8080/health | jq '.' 2>/dev/null || echo "Server not reachable"; \
		echo ""; \
		echo "WebSocket Sessions:"; \
		curl -s http://localhost:8080/api/sessions | jq '.' 2>/dev/null || echo "No session data"; \
		echo ""; \
		echo "Press Ctrl+C to exit"; \
		sleep 5; \
	done

# Quick test workflow for CI
quick-test: docker-up
	@echo "$(GREEN)Running quick tests...$(NC)"
	@sleep 3
	@curl -s http://localhost:8080/health | jq '.'
	@curl -s -X POST http://localhost:8080/api/tools/list -H "Content-Type: application/json" -d '{}' | jq '.'
	@docker-compose down
	@echo "$(GREEN)✓ Quick tests passed$(NC)"