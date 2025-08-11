import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { fetchSubtitles } from "./scraper/yt-dlp.js";
import {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Add CORS middleware before your MCP routes
app.use(
  cors({
    origin: "*", // Allow all origins - adjust as needed for production
    exposedHeaders: ["Mcp-Session-Id"],
  })
);

const getServer = () => {
  const server = new McpServer({
    name: "youtube_subtitles",
    version: "0.1.0",
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
    async (): Promise<CallToolResult> => ({
      content: [{ text: String(process.env.PHONE_NUMBER), type: "text" }],
    })
  );

  server.tool(
    "summarize_youtube_video",
    "Extract and analyze YouTube video content by retrieving captions/subtitles. Use this tool whenever a user provides a YouTube URL or asks about YouTube video content - including summaries, key points, quotes, timestamps, topics discussed, or any questions about what's said in a video.",
    {
      videoID: z
        .string()
        .length(11, "Video ID is required")
        .describe("Video ID for the YouTube video e.g 'xvFZjo5PgG0'"),
      lang: z
        .string()
        .length(2)
        .or(z.literal("")) // allow empty string
        .optional()
        .transform((val) => (val === "" ? undefined : val))
        .describe(
          "ISO 639-1 language codes e.g. en, hi. Leave empty or omit for default."
        ),
    },
    {
      title: "Get YouTube Captions/Subtitles",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ videoID, lang }): Promise<CallToolResult> => {
      try {
        const subtitles = lang
          ? await getSubtitles(videoID, lang)
          : await getSubtitles(videoID);

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
  return server;
};

app.post("/mcp", async (req: Request, res: Response) => {
  const server = getServer();
  try {
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  console.log("Received GET MCP request");
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

app.delete("/mcp", async (req: Request, res: Response) => {
  console.log("Received DELETE MCP request");
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

app.get("/health", (req, res) => {
  res.status(200).send("Server is running!");
});

//////////////////////////////////

app.listen(PORT, (error) => {
  if (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
  console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

async function getSubtitles(videoID: string, lang?: string) {
  const subtitle = await fetchSubtitles(videoID, lang);
  return subtitle.map((s) => s.text).join(" ");
}

process.on("SIGINT", async () => {
  console.log("Shutting down server...");
  process.exit(0);
});
