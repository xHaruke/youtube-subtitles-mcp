#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { getSubtitles } from "youtube-captions-scraper";
import { z } from "zod";
// Zod schemas for validation
const GetCaptionsArgsSchema = z.object({
    videoId: z.string().min(1, "Video ID is required"),
    lang: z.string().optional().default("en"),
});
const CaptionEntrySchema = z.object({
    start: z.string(),
    dur: z.string(),
    text: z.string(),
});
const CaptionsResponseSchema = z.array(CaptionEntrySchema);
class YouTubeCaptionsMCPServer {
    server;
    constructor() {
        this.server = new Server({
            name: "youtube-captions-retriever",
            version: "0.0.1",
        });
        this.setupToolHandlers();
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "get_youtube_captions",
                    description: "Retrieve captions/subtitles from a YouTube video",
                    inputSchema: {
                        type: "object",
                        properties: {
                            videoId: {
                                type: "string",
                                description: "YouTube video ID (e.g., 'dQw4w9WgXcQ')",
                            },
                            lang: {
                                type: "string",
                                description: "Language code for captions (default: 'en')",
                                default: "en",
                            },
                        },
                        required: ["videoId"],
                    },
                },
                {
                    name: "extract_video_id",
                    description: "Extract video ID from a YouTube URL",
                    inputSchema: {
                        type: "object",
                        properties: {
                            url: {
                                type: "string",
                                description: "YouTube URL to extract video ID from",
                            },
                        },
                        required: ["url"],
                    },
                },
            ],
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case "get_youtube_captions":
                        return await this.getCaptions(args);
                    case "extract_video_id":
                        return await this.extractVideoId(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${errorMessage}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }
    async getCaptions(args) {
        // Validate input arguments
        const validatedArgs = GetCaptionsArgsSchema.parse(args);
        const { videoId, lang } = validatedArgs;
        try {
            // Fetch captions using youtube-captions-scraper
            const captions = await getSubtitles({
                videoID: videoId,
                lang: lang,
            });
            // Validate the response structure
            const validatedCaptions = CaptionsResponseSchema.parse(captions);
            // Format captions for better readability
            const formattedCaptions = validatedCaptions
                .map((caption, index) => {
                const startTime = this.formatTime(parseFloat(caption.start));
                const duration = parseFloat(caption.dur);
                const endTime = this.formatTime(parseFloat(caption.start) + duration);
                return `[${index + 1}] ${startTime} - ${endTime}: ${caption.text.trim()}`;
            })
                .join("\n");
            const summary = {
                videoId,
                language: lang,
                totalCaptions: validatedCaptions.length,
                totalDuration: this.formatTime(Math.max(...validatedCaptions.map((c) => parseFloat(c.start) + parseFloat(c.dur)))),
            };
            return {
                content: [
                    {
                        type: "text",
                        text: `YouTube Captions Retrieved Successfully

Video ID: ${summary.videoId}
Language: ${summary.language}
Total Captions: ${summary.totalCaptions}
Video Duration: ~${summary.totalDuration}

Captions:
${formattedCaptions}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to retrieve captions: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    async extractVideoId(args) {
        const { url } = z.object({ url: z.string() }).parse(args);
        try {
            const videoId = this.extractYouTubeVideoId(url);
            if (!videoId) {
                throw new Error("Could not extract video ID from the provided URL");
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `Extracted Video ID: ${videoId}

You can now use this video ID with the get_youtube_captions tool.`,
                    },
                ],
            };
        }
        catch (error) {
            throw new Error(`Failed to extract video ID: ${error instanceof Error ? error.message : "Invalid YouTube URL"}`);
        }
    }
    extractYouTubeVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        // If it's already just a video ID
        if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) {
            return url.trim();
        }
        return null;
    }
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) {
            return `${hours.toString().padStart(2, "0")}:${minutes
                .toString()
                .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
        }
        return `${minutes.toString().padStart(2, "0")}:${secs
            .toString()
            .padStart(2, "0")}`;
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("YouTube Captions MCP Server running on stdio");
    }
}
// Start the server
const server = new YouTubeCaptionsMCPServer();
server.run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
