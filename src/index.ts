import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getSubtitles } from "youtube-captions-scraper";
import { z } from "zod";

const server = new McpServer({
  name: "youtube_subtitles",
  version: "0.0.1",
  capabilities: {
    resources: {},
    tools: {},
  },
});

server.tool(
  "get_youtube_captions",
  "Retrieve captions/subtitles from a YouTube video",
  {
    videoID: z
      .string()
      .length(11, "Video ID is required")
      .describe(
        "Video ID for the youtube video e.g 'xvFZjo5PgG0', 'ZoZxQwp1PiM'"
      ),
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
      const subtitles = await fetchSubtitles(videoID, lang);
      return {
        content: [
          {
            type: "text",
            text: `${subtitles}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function fetchSubtitles(videoID: string, lang: string) {
  const subtitle = await getSubtitles({ videoID, lang });
  return subtitle.map((s) => s.text).join(" ");
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
