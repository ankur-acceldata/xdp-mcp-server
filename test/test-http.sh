#!/bin/bash

# HTTP API Test Script for XDP MCP Server
# Tests all HTTP endpoints

SERVER_URL=${MCP_SERVER_URL:-http://localhost:8080}

echo "🧪 Testing XDP MCP Server HTTP Endpoints"
echo "========================================="
echo "Server: $SERVER_URL"
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -n "Testing $description... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$SERVER_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$SERVER_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓${NC} (HTTP $http_code)"
        if [ "$VERBOSE" = "true" ]; then
            echo "Response: $body" | jq '.' 2>/dev/null || echo "$body"
        fi
    else
        echo -e "${RED}✗${NC} (HTTP $http_code)"
        echo "Response: $body"
    fi
    echo ""
}

# Test health endpoint
test_endpoint "GET" "/health" "" "Health Check"

# Test readiness endpoint
test_endpoint "GET" "/ready" "" "Readiness Check"

# Test listing tools
test_endpoint "POST" "/api/tools/list" "{}" "List MCP Tools"

# Test listing datastores
test_endpoint "GET" "/api/xdp/datastores?page=0&size=5" "" "List XDP Datastores"

# Test executing a tool
echo "Testing Tool Execution..."
test_endpoint "POST" "/api/tools/execute" \
    '{"tool": "xdp_list_datastores", "params": {"page": 0, "size": 3}}' \
    "Execute xdp_list_datastores"

# Test session info
test_endpoint "GET" "/api/sessions" "" "Session Information"

# Test Trino endpoints (requires dataplane ID)
if [ ! -z "$DATAPLANE_ID" ]; then
    echo "Testing Trino Endpoints with dataplane: $DATAPLANE_ID"
    
    test_endpoint "GET" "/api/trino/$DATAPLANE_ID/catalogs" "" "List Trino Catalogs"
    
    test_endpoint "POST" "/api/trino/query" \
        "{\"dataplane\": \"$DATAPLANE_ID\", \"query\": \"SHOW CATALOGS\"}" \
        "Execute Trino Query"
else
    echo "ℹ️  Skipping Trino tests (set DATAPLANE_ID to enable)"
fi

echo ""
echo "✅ HTTP endpoint tests completed"

# Optional: Performance test
if [ "$PERF_TEST" = "true" ]; then
    echo ""
    echo "🏃 Running performance test..."
    echo "Sending 100 requests to /health endpoint..."
    
    start_time=$(date +%s)
    for i in {1..100}; do
        curl -s "$SERVER_URL/health" > /dev/null
    done
    end_time=$(date +%s)
    
    duration=$((end_time - start_time))
    echo "Completed 100 requests in ${duration} seconds"
    echo "Average: $((100 / duration)) requests/second"
fi