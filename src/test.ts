import { fetchSubtitles } from "./scraper/yt-dlp.js";

async function getSubtitles(videoID: string, lang: string) {
  const subtitle = await fetchSubtitles(videoID, lang);

  console.log(subtitle);

  return subtitle;
  // .map((s) => s.text).join(" ");
}

await getSubtitles("E3shmY6ioS4", "hi");
