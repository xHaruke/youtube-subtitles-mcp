import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

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
  videoId: string;
  language?: string;
  timeout?: number;
  cookiesUrl?: string;
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
 * Download cookies from a URL and save to a temporary file
 */
async function downloadCookiesFile(
  cookiesUrl: string,
  tempDir: string
): Promise<string | null> {
  try {
    const https = await import("https");
    const http = await import("http");

    const cookiesPath = path.join(tempDir, "cookies.txt");

    return new Promise((resolve, reject) => {
      const client = cookiesUrl.startsWith("https:") ? https : http;

      client
        .get(cookiesUrl, (response) => {
          if (response.statusCode !== 200) {
            reject(
              new Error(`Failed to fetch cookies: HTTP ${response.statusCode}`)
            );
            return;
          }

          const writeStream = require("fs").createWriteStream(cookiesPath);
          response.pipe(writeStream);

          writeStream.on("finish", () => resolve(cookiesPath));
          writeStream.on("error", reject);
        })
        .on("error", reject);
    });
  } catch (error) {
    console.warn(`Failed to download cookies from ${cookiesUrl}:`, error);
    return null;
  }
}

/**
 * Try to download subtitles by attempting common languages
 */
async function downloadAnyAvailableSubtitles(
  videoId: string,
  tempDir: string,
  outputTemplate: string,
  timeout: number,
  cookiesPath?: string
): Promise<string[]> {
  const commonLanguages = [
    "en",
    "hi",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ru",
    "ja",
    "ko",
    "zh",
    "ar",
  ];

  for (const lang of commonLanguages) {
    try {
      const command = [
        "yt-dlp",
        "--write-subs",
        "--write-auto-subs",
        "--sub-lang",
        lang,
        "--skip-download",
        "--no-warnings",
        cookiesPath ? `--cookies "${cookiesPath}"` : "",
        "--output",
        `"${outputTemplate}"`,
        `"https://www.youtube.com/watch?v=${videoId}"`,
      ]
        .filter(Boolean)
        .join(" ");

      await execAsync(command, { timeout, maxBuffer: 1024 * 1024 * 10 });

      const files = await fs.readdir(tempDir);
      const subtitleFiles = files.filter(
        (file) =>
          file.startsWith(videoId) &&
          (file.endsWith(".vtt") || file.endsWith(".srt"))
      );

      if (subtitleFiles.length > 0) {
        return subtitleFiles;
      }
    } catch (error) {
      continue;
    }
  }

  return [];
}

/**
 * Parse VTT (WebVTT) subtitle format
 */
function parseVTT(vttContent: string): Subtitle[] {
  const lines = vttContent.split("\n").map((line) => line.trim());
  const subtitles: Subtitle[] = [];
  let currentSubtitle: { start: number; end: number; text: string } | null =
    null;

  for (const line of lines) {
    if (line.startsWith("WEBVTT") || line === "") continue;

    const timeMatch = line.match(
      /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/
    );

    if (timeMatch) {
      if (currentSubtitle && currentSubtitle.text.trim()) {
        subtitles.push({
          text: cleanSubtitleText(currentSubtitle.text.trim()),
          start: currentSubtitle.start,
          duration: currentSubtitle.end - currentSubtitle.start,
        });
      }

      currentSubtitle = {
        start: timeToSeconds(timeMatch[1]),
        end: timeToSeconds(timeMatch[2]),
        text: "",
      };
    } else if (currentSubtitle && line && !line.includes("-->")) {
      currentSubtitle.text += (currentSubtitle.text ? " " : "") + line;
    }
  }

  if (currentSubtitle && currentSubtitle.text.trim()) {
    subtitles.push({
      text: cleanSubtitleText(currentSubtitle.text.trim()),
      start: currentSubtitle.start,
      duration: currentSubtitle.end - currentSubtitle.start,
    });
  }

  return deduplicateAndFilter(subtitles);
}

/**
 * Parse SRT subtitle format
 */
function parseSRT(srtContent: string): Subtitle[] {
  const blocks = srtContent.trim().split("\n\n");
  const subtitles: Subtitle[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

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
 * Clean subtitle text by removing tags and formatting
 */
function cleanSubtitleText(text: string): string {
  return text
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "") // Remove timestamp tags
    .replace(/<\/?[c|v].*?>/g, "") // Remove voice/color tags
    .replace(/<[^>]*>/g, "") // Remove other HTML tags
    .replace(/\s+/g, " ") // Clean up spaces
    .trim();
}

/**
 * Remove duplicate subtitles and filter out very short ones
 */
function deduplicateAndFilter(subtitles: Subtitle[]): Subtitle[] {
  const seen = new Set<string>();
  const filtered: Subtitle[] = [];

  for (const subtitle of subtitles) {
    if (subtitle.duration < 0.1) continue;

    const key = `${subtitle.text}_${Math.floor(subtitle.start * 10)}`;
    if (!seen.has(key)) {
      seen.add(key);
      filtered.push(subtitle);
    }
  }

  return filtered.sort((a, b) => a.start - b.start);
}

/**
 * Convert time string to seconds
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

/**
 * Fetch subtitles from YouTube using yt-dlp
 * @param options - Configuration object with videoId, language, timeout, and cookiesUrl
 * @returns Promise<Subtitle[]> Array of subtitle objects with text, start, and duration
 */
export async function fetchSubtitles(
  options: FetchSubtitlesOptions
): Promise<Subtitle[]> {
  const { videoId, language, timeout = 30000, cookiesUrl } = options;

  if (!videoId || typeof videoId !== "string") {
    throw new SubtitleError(
      "Video ID is required and must be a string",
      videoId
    );
  }

  if (language && typeof language !== "string") {
    throw new SubtitleError(
      "Language code must be a string",
      videoId,
      language
    );
  }

  const tempDir = path.join(
    os.tmpdir(),
    `yt-subs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  const outputTemplate = path.join(tempDir, `${videoId}.%(ext)s`);

  try {
    await fs.mkdir(tempDir, { recursive: true });

    // Download cookies if URL provided
    let cookiesPath: string | null = null;
    if (cookiesUrl) {
      cookiesPath = await downloadCookiesFile(cookiesUrl, tempDir);
      if (!cookiesPath) {
        console.warn(
          `Failed to download cookies from ${cookiesUrl}, continuing without cookies`
        );
      }
    }

    // Check if yt-dlp is available
    try {
      await execAsync("yt-dlp --version");
    } catch (error) {
      throw new SubtitleError(
        "yt-dlp is not installed. Please install it from https://github.com/yt-dlp/yt-dlp#installation",
        videoId,
        language
      );
    }

    let subtitleFiles: string[] = [];

    // Try specific language if provided
    if (language) {
      const command = [
        "yt-dlp",
        "--write-subs",
        "--write-auto-subs",
        "--sub-lang",
        language,
        "--skip-download",
        "--no-warnings",
        cookiesPath ? `--cookies "${cookiesPath}"` : "",
        "--output",
        `"${outputTemplate}"`,
        `"https://www.youtube.com/watch?v=${videoId}"`,
      ]
        .filter(Boolean)
        .join(" ");

      try {
        const { stderr } = await execAsync(command, {
          timeout,
          maxBuffer: 1024 * 1024 * 10,
        });

        if (
          stderr.includes("Private video") ||
          stderr.includes("Video unavailable")
        ) {
          throw new SubtitleError(
            `Video ${videoId} is private or unavailable`,
            videoId,
            language
          );
        }

        const files = await fs.readdir(tempDir);
        subtitleFiles = files.filter(
          (file) =>
            file.startsWith(videoId) &&
            (file.endsWith(".vtt") || file.endsWith(".srt"))
        );
      } catch (error: any) {
        subtitleFiles = [];
      }
    }

    // If no specific language or it failed, try any available language
    if (subtitleFiles.length === 0) {
      subtitleFiles = await downloadAnyAvailableSubtitles(
        videoId,
        tempDir,
        outputTemplate,
        timeout,
        cookiesPath || undefined
      );
    }

    if (subtitleFiles.length === 0) {
      throw new SubtitleError(
        `No subtitles found for video ${videoId}. This video may not have subtitles available.`,
        videoId,
        language
      );
    }

    // Read and parse the first available subtitle file
    const subtitleFile = subtitleFiles[0];
    const subtitlePath = path.join(tempDir, subtitleFile);
    const content = await fs.readFile(subtitlePath, "utf8");

    let subtitles: Subtitle[];
    if (subtitleFile.endsWith(".vtt")) {
      subtitles = parseVTT(content);
    } else if (subtitleFile.endsWith(".srt")) {
      subtitles = parseSRT(content);
    } else {
      throw new SubtitleError(
        `Unsupported subtitle format: ${path.extname(subtitleFile)}`,
        videoId,
        language
      );
    }

    if (subtitles.length === 0) {
      throw new SubtitleError(
        `Subtitle file is empty or could not be parsed for video ${videoId}`,
        videoId,
        language
      );
    }

    return subtitles;
  } catch (error: any) {
    if (error instanceof SubtitleError) {
      throw error;
    }

    if (error.code === "ENOENT") {
      throw new SubtitleError(
        "yt-dlp command not found. Please install yt-dlp from https://github.com/yt-dlp/yt-dlp#installation",
        videoId,
        language
      );
    }

    if (error.signal === "SIGTERM" || error.killed) {
      throw new SubtitleError(
        `Subtitle download timed out for video ${videoId}`,
        videoId,
        language
      );
    }

    throw new SubtitleError(
      `Failed to fetch subtitles for video ${videoId}: ${error.message}`,
      videoId,
      language
    );
  } finally {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`Warning: Could not clean up temp directory ${tempDir}`);
    }
  }
}
