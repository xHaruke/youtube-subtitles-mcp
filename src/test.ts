import { fetchSubtitles } from "./scraper/yt-dlp.js";
import dotenv from "dotenv";
dotenv.config();

async function getSubtitles(videoID: string, lang?: string) {
  const subtitle = await fetchSubtitles({
    videoId: videoID,
    language: lang,
    cookiesUrl: process.env.COOKIES_URL,
  });

  console.log(subtitle);

  return subtitle;
  // .map((s) => s.text).join(" ");
}

await getSubtitles("E3shmY6ioS4");
