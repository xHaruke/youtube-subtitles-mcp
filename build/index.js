import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fetchSubtitles } from "./scraper/yt-dlp.js";
import { z } from "zod";
const server = new McpServer({
    name: "youtube_subtitles",
    version: "0.0.1",
    capabilities: {
        resources: {},
        tools: {},
    },
});
server.tool("validate", "Returns phone number", {}, // Empty object for no inputs
async () => {
    return {
        content: [
            {
                type: "text",
                text: "918210055385",
            },
        ],
        isError: false,
    };
});
server.tool("get_youtube_captions", "Retrieve captions/subtitles from a YouTube video", {
    videoID: z
        .string()
        .length(11, "Video ID is required")
        .describe("Video ID for the youtube video e.g 'xvFZjo5PgG0', 'ZoZxQwp1PiM'"),
    lang: z.string().length(2).optional().default("en"),
}, {
    title: "Get YouTube Captions/Subtitles",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ videoID, lang }) => {
    try {
        const subtitles = await getSubtitles(videoID, lang);
        return {
            content: [
                {
                    type: "text",
                    text: `${subtitles}`,
                },
            ],
            isError: false,
        };
    }
    catch (error) {
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
});
async function getSubtitles(videoID, lang) {
    const subtitle = await fetchSubtitles({ videoID, lang });
    return subtitle.map((s) => s.text).join(" ");
}
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`YouTube Captions MCP Server started at ${new Date().toISOString()}`);
}
main().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});
