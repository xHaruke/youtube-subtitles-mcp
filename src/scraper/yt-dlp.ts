import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const execAsync = promisify(exec);

/**
 * Subtitle object interface
 */
export interface Subtitle {
  text: string;
  start: number;
  duration: number;
}

/**
 * Options for fetching subtitles
 */
export interface FetchSubtitlesOptions {
  language?: string;
  timeout?: number;
  useCookies?: boolean;
}

/**
 * Custom error for subtitle-related failures
 */
export class SubtitleError extends Error {
  constructor(
    message: string,
    public videoId: string,
    public languageCode?: string
  ) {
    super(message);
    this.name = "SubtitleError";
  }
}

/**
 * Options for fetching subtitles (object-style parameters)
 */
export interface FetchSubtitlesParams {
  videoID: string;
  lang?: string;
  timeout?: number;
  useCookies?: boolean;
}

/**
 * Download cookies from the remote URL
 */
async function downloadCookies(tempDir: string): Promise<string | null> {
  try {
    if (!process.env.COOKIES_URL) {
      throw new Error("COOKIES_URL environment variable not set");
    }

    const response = await axios.get(process.env.COOKIES_URL, {
      timeout: 10000, // 10 second timeout
      responseType: "text",
    });

    const cookiesPath = path.join(tempDir, "cookies.txt");
    await fs.writeFile(cookiesPath, response.data, "utf8");
    return cookiesPath;
  } catch (error: any) {
    console.warn(`Warning: Could not download cookies: ${error.message}`);
    return null;
  }
}

/**
 * Fetch subtitles from YouTube using yt-dlp (object-style parameters)
 * @param params - Object containing videoID, lang, and options
 * @returns Promise<Subtitle[]> Array of subtitle objects with text, start, and duration
 */
export async function fetchSubtitles(
  params: FetchSubtitlesParams
): Promise<Subtitle[]>;

/**
 * Fetch subtitles from YouTube using yt-dlp (separate parameters)
 * @param videoId - YouTube video ID
 * @param languageCode - Language code (default: tries 'en', then 'hi')
 * @param options - Additional options
 * @returns Promise<Subtitle[]> Array of subtitle objects with text, start, and duration
 */
export async function fetchSubtitles(
  videoId: string,
  languageCode?: string,
  options?: FetchSubtitlesOptions
): Promise<Subtitle[]>;

/**
 * Implementation of fetchSubtitles with overloads
 */
export async function fetchSubtitles(
  paramsOrVideoId: FetchSubtitlesParams | string,
  languageCode?: string,
  options: FetchSubtitlesOptions = {}
): Promise<Subtitle[]> {
  let videoId: string;
  let lang: string | undefined;
  let opts: FetchSubtitlesOptions;

  // Handle object-style parameters
  if (typeof paramsOrVideoId === "object") {
    videoId = paramsOrVideoId.videoID;
    lang = paramsOrVideoId.lang;
    opts = {
      timeout: paramsOrVideoId.timeout || options.timeout,
      useCookies: paramsOrVideoId.useCookies ?? options.useCookies ?? true,
    };
  } else {
    // Handle separate parameters
    videoId = paramsOrVideoId;
    lang = languageCode;
    opts = {
      ...options,
      useCookies: options.useCookies ?? true,
    };
  }

  // Input validation
  if (!videoId || typeof videoId !== "string") {
    throw new SubtitleError(
      "Video ID is required and must be a string",
      videoId
    );
  }

  const timeout = opts.timeout || 30000; // 30 seconds default

  // Define fallback languages if no language is provided
  const languagesToTry = lang ? [lang] : ["en", "hi"];

  // Create unique temp directory
  const tempDir = path.join(
    os.tmpdir(),
    `yt-subs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Check if yt-dlp is available
    try {
      await execAsync("yt-dlp --version");
    } catch (error) {
      throw new SubtitleError(
        "yt-dlp is not installed. Please install it from https://github.com/yt-dlp/yt-dlp#installation",
        videoId,
        lang
      );
    }

    // Download cookies if enabled
    let cookiesPath: string | null = null;
    if (opts.useCookies) {
      cookiesPath = await downloadCookies(tempDir);
    }

    // Try each language until we find subtitles
    let lastError: SubtitleError | null = null;

    for (const currentLang of languagesToTry) {
      try {
        console.log(`Trying to fetch subtitles in language: ${currentLang}`);
        const subtitles = await fetchSubtitlesForLanguage(
          videoId,
          currentLang,
          tempDir,
          timeout,
          cookiesPath
        );

        if (subtitles.length > 0) {
          console.log(
            `Successfully fetched ${subtitles.length} subtitles in ${currentLang}`
          );
          return subtitles;
        }
      } catch (error) {
        lastError =
          error instanceof SubtitleError
            ? error
            : new SubtitleError(
                `Failed to fetch subtitles in ${currentLang}: ${
                  (error as Error).message
                }`,
                videoId,
                currentLang
              );
        console.warn(
          `Failed to fetch subtitles in ${currentLang}: ${lastError.message}`
        );
      }
    }

    // If we get here, all languages failed
    throw new SubtitleError(
      `No subtitles found for video ${videoId} in any of the attempted languages: ${languagesToTry.join(
        ", "
      )}. Last error: ${lastError?.message || "Unknown error"}`,
      videoId,
      languagesToTry.join(",")
    );
  } finally {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      // Ignore cleanup errors
      console.warn(`Warning: Could not clean up temp directory ${tempDir}`);
    }
  }
}

/**
 * Fetch subtitles for a specific language
 */
async function fetchSubtitlesForLanguage(
  videoId: string,
  languageCode: string,
  tempDir: string,
  timeout: number,
  cookiesPath: string | null
): Promise<Subtitle[]> {
  const outputTemplate = path.join(
    tempDir,
    `${videoId}-${languageCode}.%(ext)s`
  );

  // Build yt-dlp command
  const commandParts = [
    "yt-dlp",
    "--write-subs",
    "--write-auto-subs",
    "--sub-lang",
    languageCode,
    "--skip-download",
    "--no-warnings",
    "--output",
    `"${outputTemplate}"`,
  ];

  // Add cookies if available
  if (cookiesPath) {
    commandParts.push("--cookies", `"${cookiesPath}"`);
  }

  commandParts.push(`"https://www.youtube.com/watch?v=${videoId}"`);

  const command = commandParts.join(" ");

  const { stdout, stderr } = await execAsync(command, {
    timeout,
    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
  });

  // Check for common error patterns in stderr
  if (
    stderr.includes("Private video") ||
    stderr.includes("Video unavailable")
  ) {
    throw new SubtitleError(
      `Video ${videoId} is private or unavailable`,
      videoId,
      languageCode
    );
  }

  if (stderr.includes("No such file or directory")) {
    throw new SubtitleError(
      "yt-dlp command not found. Please install yt-dlp",
      videoId,
      languageCode
    );
  }

  // Find subtitle files
  const files = await fs.readdir(tempDir);
  const subtitleFiles = files.filter(
    (file) =>
      file.includes(videoId) &&
      file.includes(languageCode) &&
      (file.endsWith(".vtt") || file.endsWith(".srt"))
  );

  if (subtitleFiles.length === 0) {
    // Try to find any subtitle files for this video (fallback)
    const anySubFiles = files.filter(
      (file) =>
        file.includes(videoId) &&
        (file.endsWith(".vtt") || file.endsWith(".srt"))
    );

    if (anySubFiles.length === 0) {
      throw new SubtitleError(
        `No subtitles found for video ${videoId} in language ${languageCode}`,
        videoId,
        languageCode
      );
    } else {
      // Use the first available subtitle file as fallback
      subtitleFiles.push(anySubFiles[0]);
    }
  }

  // Use the first available subtitle file
  const subtitleFile = subtitleFiles[0];
  const subtitlePath = path.join(tempDir, subtitleFile);

  // Read subtitle content
  const content = await fs.readFile(subtitlePath, "utf8");

  // Parse based on file extension
  let subtitles: Subtitle[];
  if (subtitleFile.endsWith(".vtt")) {
    subtitles = parseVTT(content);
  } else if (subtitleFile.endsWith(".srt")) {
    subtitles = parseSRT(content);
  } else {
    throw new SubtitleError(
      `Unsupported subtitle format: ${path.extname(subtitleFile)}`,
      videoId,
      languageCode
    );
  }

  return subtitles;
}

/**
 * Parse VTT (WebVTT) subtitle format
 * @param vttContent - VTT file content
 * @returns Parsed subtitles
 */
function parseVTT(vttContent: string): Subtitle[] {
  const lines = vttContent.split("\n").map((line) => line.trim());
  const subtitles: Subtitle[] = [];
  let currentSubtitle: { start: number; end: number; text: string } | null =
    null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip WEBVTT header and empty lines
    if (line.startsWith("WEBVTT") || line === "") {
      continue;
    }

    // Check for timestamp line
    const timeMatch = line.match(
      /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/
    );
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
    } else if (currentSubtitle && line && !line.includes("-->")) {
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
function parseSRT(srtContent: string): Subtitle[] {
  const blocks = srtContent.trim().split("\n\n");
  const subtitles: Subtitle[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    // Skip sequence number (first line)
    const timeLine = lines[1];
    const textLines = lines.slice(2);

    const timeMatch = timeLine.match(
      /^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/
    );
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
function cleanSubtitleText(text: string): string {
  return (
    text
      // Remove WebVTT timestamp tags like <00:01:23.119>
      .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
      // Remove WebVTT voice/color tags like <c> and </c>
      .replace(/<\/?[c|v].*?>/g, "")
      // Remove other HTML-like tags
      .replace(/<[^>]*>/g, "")
      // Clean up multiple spaces
      .replace(/\s+/g, " ")
      // Trim whitespace
      .trim()
  );
}

/**
 * Remove duplicate subtitles and filter out very short ones
 * @param subtitles - Raw subtitle array
 * @returns Cleaned subtitle array
 */
function deduplicateAndFilter(subtitles: Subtitle[]): Subtitle[] {
  const seen = new Set<string>();
  const filtered: Subtitle[] = [];

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
function timeToSeconds(timeString: string): number {
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
