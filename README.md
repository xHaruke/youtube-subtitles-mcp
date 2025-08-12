# YouTube Captions MCP Server

A Model Context Protocol (MCP) server for retrieving YouTube video captions and subtitles. This server provides seamless integration with MCP-compatible clients to fetch and process YouTube video transcripts.

🌐 **Live Server**: [mcp-youtube-subtitles.fly.dev/mcp](https://mcp-youtube-subtitles.fly.dev/mcp)

## Features

- 🎥 Fetch captions from YouTube videos
- 🌐 Support for multiple subtitle formats
- 🔧 MCP-compliant server implementation
- 📝 TypeScript support with full type safety
- 🍪 Optional cookie support for enhanced access
- ⚡ Express.js server with CORS support

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn package manager

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory with the following optional variables:

```env
PORT=3000
COOKIES_URL=https://url/path/to/cookies.txt
```

### Environment Variables

| Variable      | Description                                         | Default | Required |
| ------------- | --------------------------------------------------- | ------- | -------- |
| `PORT`        | Server port number                                  | `3000`  | No       |
| `COOKIES_URL` | URL to cookies.txt file for enhanced YouTube access | -       | No       |

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Testing

```bash
npm test
```

### MCP Inspector

Debug and inspect the MCP server using the official inspector:

```bash
npm run server:inspect
```

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start the production server
- `npm run dev` - Start development server with hot reload
- `npm test` - Run tests
- `npm run clean` - Remove build directory
- `npm run server:inspect` - Start MCP inspector for debugging

## Dependencies

### Core Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK for server implementation
- `axios` - HTTP client for API requests
- `express` - Web framework
- `zod` - Runtime type validation

### Development Dependencies

- `@modelcontextprotocol/inspector` - MCP debugging tool
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution engine

## License

This project is licensed under the Mozilla Public License 2.0 (MPL-2.0).

## Author

xharuke

## Contributing

1. Fork the repository at [github.com/xHaruke/youtube-subtitles-mcp](https://github.com/xHaruke/youtube-subtitles-mcp)
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Keywords

`mcp`, `model-context-protocol`, `youtube`, `captions`, `subtitles`, `typescript`
