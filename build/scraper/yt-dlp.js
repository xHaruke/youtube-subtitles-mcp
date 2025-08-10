import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
const execAsync = promisify(exec);
/**
 * Custom error for subtitle-related failures
 */
export class SubtitleError extends Error {
    videoId;
    languageCode;
    constructor(message, videoId, languageCode) {
        super(message);
        this.videoId = videoId;
        this.languageCode = languageCode;
        this.name = "SubtitleError";
    }
}
/**
 * Implementation of fetchSubtitles with overloads
 */
export async function fetchSubtitles(paramsOrVideoId, languageCode = "en", options = {}) {
    let videoId;
    let lang;
    let opts;
    // Handle object-style parameters
    if (typeof paramsOrVideoId === "object") {
        videoId = paramsOrVideoId.videoID;
        lang = paramsOrVideoId.lang || "en";
        opts = {
            timeout: paramsOrVideoId.timeout || options.timeout,
        };
    }
    else {
        // Handle separate parameters
        videoId = paramsOrVideoId;
        lang = languageCode;
        opts = options;
    }
    // Input validation
    if (!videoId || typeof videoId !== "string") {
        throw new SubtitleError("Video ID is required and must be a string", videoId);
    }
    if (typeof lang !== "string") {
        throw new SubtitleError("Language code must be a string", videoId, lang);
    }
    const timeout = opts.timeout || 30000; // 30 seconds default
    // Create unique temp directory
    const tempDir = path.join(os.tmpdir(), `yt-subs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const outputTemplate = path.join(tempDir, `${videoId}.%(ext)s`);
    try {
        // Create temp directory
        await fs.mkdir(tempDir, { recursive: true });
        // Check if yt-dlp is available
        try {
            await execAsync("yt-dlp --version");
        }
        catch (error) {
            throw new SubtitleError("yt-dlp is not installed. Please install it from https://github.com/yt-dlp/yt-dlp#installation", videoId, languageCode);
        }
        // Download subtitles using yt-dlp
        const command = [
            "yt-dlp",
            "--write-subs",
            "--write-auto-subs",
            "--sub-lang",
            languageCode,
            "--skip-download",
            "--no-warnings",
            "--output",
            `"${outputTemplate}"`,
            `"https://www.youtube.com/watch?v=${videoId}"`,
        ].join(" ");
        const { stdout, stderr } = await execAsync(command, {
            timeout,
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        });
        // Check for common error patterns in stderr
        if (stderr.includes("Private video") ||
            stderr.includes("Video unavailable")) {
            throw new SubtitleError(`Video ${videoId} is private or unavailable`, videoId, languageCode);
        }
        if (stderr.includes("No such file or directory")) {
            throw new SubtitleError("yt-dlp command not found. Please install yt-dlp", videoId, languageCode);
        }
        // Find subtitle files
        const files = await fs.readdir(tempDir);
        const subtitleFiles = files.filter((file) => file.startsWith(videoId) &&
            (file.endsWith(".vtt") || file.endsWith(".srt")));
        if (subtitleFiles.length === 0) {
            // Try to find auto-generated subtitles or other language variants
            const anySubFiles = files.filter((file) => file.endsWith(".vtt") || file.endsWith(".srt"));
            if (anySubFiles.length === 0) {
                throw new SubtitleError(`No subtitles found for video ${videoId}. This video may not have subtitles available.`, videoId, languageCode);
            }
            else {
                throw new SubtitleError(`No subtitles found for language '${languageCode}' for video ${videoId}. Available subtitle files: ${anySubFiles.join(", ")}`, videoId, languageCode);
            }
        }
        // Use the first available subtitle file
        const subtitleFile = subtitleFiles[0];
        const subtitlePath = path.join(tempDir, subtitleFile);
        // Read subtitle content
        const content = await fs.readFile(subtitlePath, "utf8");
        // Parse based on file extension
        let subtitles;
        if (subtitleFile.endsWith(".vtt")) {
            subtitles = parseVTT(content);
        }
        else if (subtitleFile.endsWith(".srt")) {
            subtitles = parseSRT(content);
        }
        else {
            throw new SubtitleError(`Unsupported subtitle format: ${path.extname(subtitleFile)}`, videoId, languageCode);
        }
        if (subtitles.length === 0) {
            throw new SubtitleError(`Subtitle file is empty or could not be parsed for video ${videoId}`, videoId, languageCode);
        }
        return subtitles;
    }
    catch (error) {
        // Re-throw SubtitleError instances as-is
        if (error instanceof SubtitleError) {
            throw error;
        }
        // Handle exec errors
        if (error.code === "ENOENT") {
            throw new SubtitleError("yt-dlp command not found. Please install yt-dlp from https://github.com/yt-dlp/yt-dlp#installation", videoId, languageCode);
        }
        if (error.signal === "SIGTERM" || error.killed) {
            throw new SubtitleError(`Subtitle download timed out for video ${videoId}`, videoId, languageCode);
        }
        // Generic error
        throw new SubtitleError(`Failed to fetch subtitles for video ${videoId}: ${error.message}`, videoId, languageCode);
    }
    finally {
        // Clean up temp directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
        catch (cleanupError) {
            // Ignore cleanup errors
            console.warn(`Warning: Could not clean up temp directory ${tempDir}`);
        }
    }
}
/**
 * Parse VTT (WebVTT) subtitle format
 * @param vttContent - VTT file content
 * @returns Parsed subtitles
 */
function parseVTT(vttContent) {
    const lines = vttContent.split("\n").map((line) => line.trim());
    const subtitles = [];
    let currentSubtitle = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip WEBVTT header and empty lines
        if (line.startsWith("WEBVTT") || line === "") {
            continue;
        }
        // Check for timestamp line
        const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
        if (timeMatch) {
            // Save previous subtitle if exists
            if (currentSubtitle && currentSubtitle.text.trim()) {
                subtitles.push({
                    text: cleanSubtitleText(currentSubtitle.text.trim()),
                    start: currentSubtitle.start,
                    duration: currentSubtitle.end - currentSubtitle.start,
                });
            }
            // Start new subtitle
            currentSubtitle = {
                start: timeToSeconds(timeMatch[1]),
                end: timeToSeconds(timeMatch[2]),
                text: "",
            };
        }
        else if (currentSubtitle && line && !line.includes("-->")) {
            // Add text line to current subtitle
            currentSubtitle.text += (currentSubtitle.text ? " " : "") + line;
        }
    }
    // Don't forget the last subtitle
    if (currentSubtitle && currentSubtitle.text.trim()) {
        subtitles.push({
            text: cleanSubtitleText(currentSubtitle.text.trim()),
            start: currentSubtitle.start,
            duration: currentSubtitle.end - currentSubtitle.start,
        });
    }
    // Remove duplicates and very short durations
    return deduplicateAndFilter(subtitles);
}
/**
 * Parse SRT subtitle format
 * @param srtContent - SRT file content
 * @returns Parsed subtitles
 */
function parseSRT(srtContent) {
    const blocks = srtContent.trim().split("\n\n");
    const subtitles = [];
    for (const block of blocks) {
        const lines = block.split("\n");
        if (lines.length < 3)
            continue;
        // Skip sequence number (first line)
        const timeLine = lines[1];
        const textLines = lines.slice(2);
        const timeMatch = timeLine.match(/^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
        if (timeMatch) {
            const startTime = timeToSeconds(timeMatch[1].replace(",", "."));
            const endTime = timeToSeconds(timeMatch[2].replace(",", "."));
            const text = textLines.join(" ").trim();
            if (text) {
                subtitles.push({
                    text: cleanSubtitleText(text),
                    start: startTime,
                    duration: endTime - startTime,
                });
            }
        }
    }
    return deduplicateAndFilter(subtitles);
}
/**
 * Clean subtitle text by removing HTML-like tags and formatting
 * @param text - Raw subtitle text
 * @returns Cleaned text
 */
function cleanSubtitleText(text) {
    return (text
        // Remove WebVTT timestamp tags like <00:01:23.119>
        .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
        // Remove WebVTT voice/color tags like <c> and </c>
        .replace(/<\/?[c|v].*?>/g, "")
        // Remove other HTML-like tags
        .replace(/<[^>]*>/g, "")
        // Clean up multiple spaces
        .replace(/\s+/g, " ")
        // Trim whitespace
        .trim());
}
/**
 * Remove duplicate subtitles and filter out very short ones
 * @param subtitles - Raw subtitle array
 * @returns Cleaned subtitle array
 */
function deduplicateAndFilter(subtitles) {
    const seen = new Set();
    const filtered = [];
    for (const subtitle of subtitles) {
        // Skip very short durations (likely duplicates)
        if (subtitle.duration < 0.1) {
            continue;
        }
        // Create a key for deduplication based on text and approximate timing
        const key = `${subtitle.text}_${Math.floor(subtitle.start * 10)}`;
        if (!seen.has(key)) {
            seen.add(key);
            filtered.push(subtitle);
        }
    }
    // Sort by start time
    return filtered.sort((a, b) => a.start - b.start);
}
/**
 * Convert time string to seconds
 * @param timeString - Time in format HH:MM:SS.mmm
 * @returns Time in seconds
 */
function timeToSeconds(timeString) {
    const parts = timeString.split(":");
    if (parts.length !== 3) {
        throw new Error(`Invalid time format: ${timeString}`);
    }
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
}
// Default export for CommonJS compatibility
export default fetchSubtitles;
