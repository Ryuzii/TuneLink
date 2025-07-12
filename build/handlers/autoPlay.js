// autoPlay.js
// Modular, robust autoPlay logic for TuneLink
const undici = require('undici');
const { JSDOM } = require('jsdom');

const DEFAULT_MARKET = 'US';
const MAX_SC_TRACKS = 40;
const LOGGING_ENABLED = process.env.DEBUG_AUTOPLAY === '1';

function log(...args) {
    if (LOGGING_ENABLED) console.log('[autoPlay]', ...args);
}

/**
 * Fetches a random recommended SoundCloud track URL.
 * @param {string} url - The base SoundCloud user/profile URL.
 * @param {object} [opts]
 * @param {number} [opts.maxTracks=40] - Max tracks to consider.
 * @returns {Promise<string|null>} Track URL or null if not found.
 */
async function scAutoPlay(url, { maxTracks = MAX_SC_TRACKS } = {}) {
    try {
        const res = await undici.fetch(`${url}/recommended`);
        if (res.status !== 200) {
            log('SoundCloud fetch failed', res.status);
            return null;
        }
        const html = await res.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;
        let trackLinks = [];
        try {
            const secondNoscript = document.querySelectorAll('noscript')[1];
            if (secondNoscript) {
                const sectionElement = secondNoscript.querySelector('section');
                if (sectionElement) {
                    const articleElements = sectionElement.querySelectorAll('article');
                    articleElements.forEach(articleElement => {
                        const h2Element = articleElement.querySelector('h2[itemprop="name"]');
                        if (h2Element) {
                            const aElement = h2Element.querySelector('a[itemprop="url"]');
                            if (aElement) {
                                const href = aElement.getAttribute('href');
                                if (href) {
                                    trackLinks.push(`https://soundcloud.com${href}`);
                                }
                            }
                        }
                    });
                }
            }
        } catch (e) {
            log('SoundCloud DOM parse error', e);
        }
        if (trackLinks.length === 0) {
            const regex = /<a\s+itemprop="url"\s+href="(\/[^"]+)"/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                trackLinks.push(`https://soundcloud.com${match[1]}`);
                if (trackLinks.length >= maxTracks) break;
            }
        }
        if (trackLinks.length === 0) {
            log('No SoundCloud tracks found');
            return null;
        }
        return trackLinks[Math.floor(Math.random() * trackLinks.length)];
    } catch (err) {
        log('scAutoPlay error', err);
        return null;
    }
}

// --- Spotify ---
let spotifyTokenCache = { token: null, expires: 0 };
/**
 * Fetches a Spotify access token, caching until expiry.
 * @param {object} [opts]
 * @param {string} [opts.clientId]
 * @param {string} [opts.clientSecret]
 * @returns {Promise<string>} Access token
 */
async function getSpotifyAccessTokenCached(opts = {}) {
    if (spotifyTokenCache.token && Date.now() < spotifyTokenCache.expires) {
        return spotifyTokenCache.token;
    }
    const clientId = opts.clientId || process.env.SPOTIFY_CLIENT_ID || 'ab6373a74cbe461386fdee1d6f276b67';
    const clientSecret = opts.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || 'eb2843351b3d45b49e6e1d043364f3f2';
    if (!clientId || !clientSecret) {
        throw new Error('Spotify Client ID or Secret not found in environment variables or options.');
    }
    const response = await undici.fetch("https://accounts.spotify.com/api/token", {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to get Spotify access token. Status: ${response.status}. Body: ${errorBody}`);
    }
    const data = await response.json();
    spotifyTokenCache = {
        token: data.access_token,
        expires: Date.now() + 50 * 60 * 1000
    };
    return data.access_token;
}

/**
 * Fetches a random recommended Spotify track ID using related artists and their top tracks.
 * @param {string} track_id - The starting Spotify track ID.
 * @param {object} [opts]
 * @param {string} [opts.market=DEFAULT_MARKET] - Market code.
 * @param {string} [opts.clientId]
 * @param {string} [opts.clientSecret]
 * @returns {Promise<string|null>} Track ID or null if not found.
 */
async function spAutoPlay(track_id, { market = DEFAULT_MARKET, clientId, clientSecret } = {}) {
    try {
        const accessToken = await getSpotifyAccessTokenCached({ clientId, clientSecret });
        const authHeaders = { Authorization: `Bearer ${accessToken}` };
        const trackDetailsResponse = await undici.fetch(`https://api.spotify.com/v1/tracks/${track_id}`, {
            headers: authHeaders,
        });
        if (!trackDetailsResponse.ok) {
            log(`Failed to fetch track details for ${track_id}`, trackDetailsResponse.status);
            return null;
        }
        const trackDetails = await trackDetailsResponse.json();
        if (!trackDetails.artists || trackDetails.artists.length === 0) {
            log(`No artists found for input track ${track_id}`);
            return null;
        }
        const primaryArtistId = trackDetails.artists[0].id;
        let artistToQueryId = primaryArtistId;
        // Try to get a related artist
        const relatedArtistsResponse = await undici.fetch(`https://api.spotify.com/v1/artists/${primaryArtistId}/related-artists`, {
            headers: authHeaders,
        });
        if (relatedArtistsResponse.ok) {
            const relatedArtistsData = await relatedArtistsResponse.json().catch(() => null);
            if (relatedArtistsData && relatedArtistsData.artists && relatedArtistsData.artists.length > 0) {
                artistToQueryId = relatedArtistsData.artists[Math.floor(Math.random() * relatedArtistsData.artists.length)].id;
            }
        }
        // Get top tracks for the chosen artist
        let topTracksResponse = await undici.fetch(`https://api.spotify.com/v1/artists/${artistToQueryId}/top-tracks?market=${market}`, {
            headers: authHeaders,
        });
        if (!topTracksResponse.ok && artistToQueryId !== primaryArtistId) {
            // Fallback to primary artist
            topTracksResponse = await undici.fetch(`https://api.spotify.com/v1/artists/${primaryArtistId}/top-tracks?market=${market}`, {
                headers: authHeaders,
            });
            artistToQueryId = primaryArtistId;
        }
        if (!topTracksResponse.ok) {
            log(`Failed to fetch top tracks for artist ${artistToQueryId}`, topTracksResponse.status);
            return null;
        }
        const topTracksData = await topTracksResponse.json();
        if (!topTracksData.tracks || topTracksData.tracks.length === 0) {
            log(`No top tracks found for artist ${artistToQueryId} in market ${market}`);
            return null;
        }
        return topTracksData.tracks[Math.floor(Math.random() * topTracksData.tracks.length)].id;
    } catch (err) {
        log('spAutoPlay error', err);
        return null;
    }
}

module.exports = {
    scAutoPlay,
    spAutoPlay
}; 