import { fetchSubtitles } from "./scraper/yt-dlp.js";
async function getSubtitles(videoID, lang) {
    const subtitle = await fetchSubtitles(videoID, lang);
    console.log(subtitle);
    return subtitle;
    // .map((s) => s.text).join(" ");
}
await getSubtitles("uHAx_2bn1kU", "en");
