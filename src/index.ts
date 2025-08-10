import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { fetchSubtitles } from "./scraper/yt-dlp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import cors from "cors";
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Add CORS middleware before your MCP routes
app.use(
  cors({
    origin: "*", // Configure appropriately for production, for example:
    // origin: ['https://your-remote-domain.com', 'https://your-other-remote-domain.com'],
    exposedHeaders: ["Mcp-Session-Id"],
    allowedHeaders: ["Content-Type", "mcp-session-id"],
  })
);

app.use(express.json());

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication
app.post("/mcp", async (req, res) => {
  // Check for existing session ID
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      },
      // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
      // locally, make sure to set:
      // enableDnsRebindingProtection: true,
      // allowedHosts: ['127.0.0.1'],
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    const server = new McpServer({
      name: "youtube_subtitles",
      version: "0.0.1",
      capabilities: {
        resources: {},
        tools: {},
      },
    });

    // ... set up server resources, tools, and prompts ...
    server.tool(
      "validate",
      "Validated this mcp server to be used by PuchAI",
      {},
      async () => ({
        content: [{ text: String(process.env.PHONE_NUMBER), type: "text" }],
      })
    );

    server.tool(
      "get_youtube_captions",
      "Retrieve captions/subtitles from a YouTube video",
      {
        videoID: z
          .string()
          .length(11, "Video ID is required")
          .describe("Video ID for the YouTube video e.g 'xvFZjo5PgG0'"),
        lang: z.string().length(2).optional().default("en"),
      },
      {
        title: "Get YouTube Captions/Subtitles",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      async ({ videoID, lang }) => {
        try {
          const subtitles = await getSubtitles(videoID, lang);
          return {
            content: [{ type: "text", text: subtitles }],
            isError: false,
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error}` }],
            isError: true,
          };
        }
      }
    );

    // Connect to the MCP server
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (
  req: express.Request,
  res: express.Response
) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get("/mcp", handleSessionRequest);

// Handle DELETE requests for session termination
app.delete("/mcp", handleSessionRequest);

app.listen(3000, function (err) {
  if (err) console.log("Error in server setup");
  console.log("Server listening on Port", PORT);
});

async function getSubtitles(videoID: string, lang: string) {
  const subtitle = await fetchSubtitles(videoID, lang);
  return subtitle.map((s) => s.text).join(" ");
}
