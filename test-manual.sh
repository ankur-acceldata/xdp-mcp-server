#!/bin/bash

# Manual MCP Server Test (curl-equivalent for stdio)
# This shows how to manually test the MCP server using echo and pipes

echo "🔧 Manual MCP Server Test (equivalent to curl for stdio transport)"
echo ""

# Set environment variables
export XDP_ACCESS_KEY="ZUDOSEQZQEKQCTJ"
export XDP_SECRET_KEY="TY2C51SAU3CHUALOVDY4JEOYGFCSM0"

echo "📤 Testing List Tools Request:"
echo ""

# Create the JSON-RPC request
LIST_TOOLS_REQUEST='{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}'

echo "Request JSON:"
echo "$LIST_TOOLS_REQUEST" | jq .
echo ""

echo "📥 Sending to MCP server..."
echo ""

# Send request to server and capture response
echo "$LIST_TOOLS_REQUEST" | timeout 5s node dist/index.js 2>/dev/null | head -1 | jq .

echo ""
echo "📤 Testing Tool Call Request:"
echo ""

# Create tool call request
TOOL_CALL_REQUEST='{
  "jsonrpc": "2.0", 
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "xdp_list_datastores",
    "arguments": {
      "page": 0,
      "size": 2
    }
  }
}'

echo "Request JSON:"
echo "$TOOL_CALL_REQUEST" | jq .
echo ""

echo "📥 Sending to MCP server..."
echo ""

# Send both requests in sequence
{
  echo "$LIST_TOOLS_REQUEST"
  sleep 1
  echo "$TOOL_CALL_REQUEST"
} | timeout 10s node dist/index.js 2>/dev/null | tail -1 | jq .

echo ""
echo "✅ Manual test completed!"
echo ""
echo "Note: MCP uses JSON-RPC over stdin/stdout, not HTTP like curl."
echo "The above commands simulate what Claude Desktop does when communicating with the MCP server."