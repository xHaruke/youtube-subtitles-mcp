import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const server = new McpServer({
    name: "youtube-subtitles",
    version: "0.0.1",
    capabilities: {
        resources: {},
        tools: {},
    },
});
server.tool("get_youtube_captions", "Retrieve captions/subtitles from a YouTube video", {
    videoId: z.string
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main();
