# XDP MCP Server

A Model Context Protocol (MCP) server that provides seamless integration with XDP (eXtended Data Platform) for data engineering and analytics tasks.

## 🚀 Quick Start

### 1. Setup for Claude Desktop
```bash
# Install dependencies and build
npm install
npm run build

# Auto-configure Claude Desktop
./setup-claude-desktop.sh
```

### 2. Restart Claude Desktop

### 3. Test Integration
Open Claude Desktop and try:
```
List all data stores from XDP
```

## 📋 Features

- **🔗 XDP API Integration**: Direct connection to XDP platform using access/secret keys
- **📊 Data Store Listing**: Fetch and browse all available data stores with pagination
- **🔧 Claude Desktop Ready**: Pre-configured for immediate use with Claude Desktop
- **🛡️ Robust Error Handling**: Comprehensive error handling and user-friendly messages
- **📝 Detailed Logging**: Extensive logging for debugging and monitoring

## 🏗️ Architecture

```
Claude Desktop ←→ XDP MCP Server ←→ XDP API
    (stdio)         (Node.js)       (REST/HTTPS)
```

## 📁 Project Structure

```
xdp-mcp-server/
├── README.md                 # This file
├── mcp.md                    # Detailed development guide
├── TESTING.md                # Comprehensive testing guide
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── setup-claude-desktop.sh   # Auto-setup script
├── claude_desktop_config.json # Example config
├── src/
│   ├── index.ts              # Main MCP server
│   ├── services/
│   │   └── xdp-api-client.ts # XDP API integration
│   └── types/
│       └── xdp-types.ts      # TypeScript definitions
└── dist/                     # Compiled output
```

## 🛠️ Available Tools

### `xdp_list_datastores`
List data stores from XDP platform with pagination support.

**Parameters:**
- `page` (optional): Page number (0-based, default: 0)
- `size` (optional): Items per page (default: 20, max: 100) 
- `sortBy` (optional): Sort field and direction (default: "updatedAt:asc")

**Example Usage:**
```
Show me data stores on page 2 with 10 items, sorted by name
```

## 🔧 Development

### Build and Test
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Test locally
export XDP_ACCESS_KEY="your-access-key"
export XDP_SECRET_KEY="your-secret-key"
npm run test
```

### Environment Variables
- `XDP_ACCESS_KEY`: XDP API access key (required)
- `XDP_SECRET_KEY`: XDP API secret key (required)  
- `XDP_BASE_URL`: API base URL (optional, defaults to demo.xdp.acceldata.tech)

## 📖 Documentation

- **[mcp.md](./mcp.md)**: Detailed development guide and architecture
- **[TESTING.md](./TESTING.md)**: Comprehensive testing and troubleshooting guide

## 🚨 Troubleshooting

### Server Won't Start
```bash
# Check Node.js version (requires 18+)
node --version

# Rebuild project
npm run clean && npm run build
```

### Authentication Issues
- Verify access/secret keys are correct
- Ensure no extra spaces in credentials
- Test API connectivity directly

### Claude Desktop Integration
- Verify config file path: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Ensure absolute paths in configuration
- Restart Claude Desktop completely

See [TESTING.md](./TESTING.md) for detailed troubleshooting.

## 🔮 Future Enhancements

- [ ] Spark context and query execution
- [ ] Trino cluster integration  
- [ ] Data pipeline management
- [ ] Real-time monitoring
- [ ] Bolt.diy web integration

## 📞 Support

1. Check [TESTING.md](./TESTING.md) for solutions
2. Review server logs for specific errors
3. Test XDP API connectivity independently
4. Verify Claude Desktop configuration format

## 📄 License

MIT License - see package.json for details.