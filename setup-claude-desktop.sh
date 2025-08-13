#!/bin/bash

# Setup script for Claude Desktop integration

echo "🚀 Setting up XDP MCP Server for Claude Desktop"

# Check if Claude Desktop config directory exists
CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

if [ ! -d "$CLAUDE_CONFIG_DIR" ]; then
    echo "❌ Claude Desktop not found. Please install Claude Desktop first."
    echo "   Download from: https://claude.ai/download"
    exit 1
fi

echo "✅ Claude Desktop found at: $CLAUDE_CONFIG_DIR"

# Backup existing config if it exists
if [ -f "$CLAUDE_CONFIG_FILE" ]; then
    echo "📋 Backing up existing Claude Desktop config..."
    cp "$CLAUDE_CONFIG_FILE" "$CLAUDE_CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Get absolute path to the project
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create the config with absolute path
echo "📝 Creating Claude Desktop configuration..."
cat > "$CLAUDE_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "xdp": {
      "command": "node",
      "args": ["$PROJECT_DIR/dist/index.js"],
      "env": {
        "XDP_ACCESS_KEY": "ZUDOSEQZQEKQCTJ",
        "XDP_SECRET_KEY": "TY2C51SAU3CHUALOVDY4JEOYGFCSM0"
      }
    }
  }
}
EOF

echo "✅ Claude Desktop configuration created at: $CLAUDE_CONFIG_FILE"

# Test the server
echo "🧪 Testing XDP MCP Server..."
export XDP_ACCESS_KEY="ZUDOSEQZQEKQCTJ"
export XDP_SECRET_KEY="TY2C51SAU3CHUALOVDY4JEOYGFCSM0"

if timeout 5s node "$PROJECT_DIR/dist/index.js" > /dev/null 2>&1; then
    echo "✅ XDP MCP Server test passed"
else
    echo "⚠️  XDP MCP Server test had issues (may be normal for stdio mode)"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop application"
echo "2. Start a new conversation"
echo "3. Try using the XDP tools:"
echo "   - 'List all data stores from XDP'"
echo "   - 'Show me the first 10 data stores'"
echo ""
echo "Troubleshooting:"
echo "- Check Claude Desktop logs in Console.app (search for 'Claude')"
echo "- Verify the server builds: npm run build"
echo "- Test server directly: npm run test"