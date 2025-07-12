// fetchImage.js
// Modular, robust getImageUrl for TuneLink with in-memory caching
const undici = require("undici");

const imageCache = new Map();

async function getImageUrl(info) {
    if (!info || !info.sourceName || !info.identifier) return null;
    const cacheKey = `${info.sourceName}:${info.identifier}`;
    if (imageCache.has(cacheKey)) {
        return imageCache.get(cacheKey);
    }
    let url = null;
    try {
        if (info.sourceName === "spotify") {
            const match = info.uri && info.uri.match(/track\/([a-zA-Z0-9]+)/);
            if (match) {
                const res = await undici.fetch(`https://open.spotify.com/oembed?url=${info.uri}`);
                if (res.ok) {
                    const json = await res.json();
                    url = json.thumbnail_url || null;
                }
            }
        } else if (info.sourceName === "soundcloud") {
            const res = await undici.fetch(`https://soundcloud.com/oembed?format=json&url=${info.uri}`);
            if (res.ok) {
                const json = await res.json();
                url = json.thumbnail_url || null;
            }
        } else if (info.sourceName === "youtube") {
            const maxResUrl = `https://img.youtube.com/vi/${info.identifier}/maxresdefault.jpg`;
            const hqDefaultUrl = `https://img.youtube.com/vi/${info.identifier}/hqdefault.jpg`;
            const mqDefaultUrl = `https://img.youtube.com/vi/${info.identifier}/mqdefault.jpg`;
            const defaultUrl = `https://img.youtube.com/vi/${info.identifier}/default.jpg`;
            const urls = [maxResUrl, hqDefaultUrl, mqDefaultUrl, defaultUrl];
            for (const testUrl of urls) {
                try {
                    const res = await undici.fetch(testUrl);
                    if (res.ok) {
                        url = testUrl;
                        break;
                    }
                } catch {}
            }
        }
    } catch {}
    if (url) {
        imageCache.set(cacheKey, url);
        return url;
    }
    return null;
}

module.exports = { getImageUrl }; 