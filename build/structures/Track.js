/**
 * Track class for TuneLink
 * Handles track metadata, thumbnail resolution, and smart resolving.
 */
const { getImageUrl } = require('../handlers/fetchImage');
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class Track {
    constructor(data, requester, node) {
        this.rawData = data;
        this.track = data.encoded;
        this.info = {
            identifier: data.info.identifier,
            seekable: data.info.isSeekable,
            author: data.info.author,
            length: data.info.length,
            stream: data.info.isStream,
            position: data.info.position,
            title: data.info.title,
            uri: data.info.uri,
            requester,
            sourceName: data.info.sourceName,
            isrc: data.info?.isrc || null,
            _cachedThumbnail: data.info.thumbnail ?? null,
            get thumbnail() {
                if (data.info.thumbnail) return data.info.thumbnail;
                if (node.rest.version === "v4") {
                    if (data.info.artworkUrl) {
                        this._cachedThumbnail = data.info.artworkUrl;
                        return data.info.artworkUrl;
                    } else {
                        return !this._cachedThumbnail ? (this._cachedThumbnail = getImageUrl(this)) : this._cachedThumbnail ?? null;
                    }
                } else {
                    return !this._cachedThumbnail
                        ? (this._cachedThumbnail = getImageUrl(this))
                        : this._cachedThumbnail ?? null;
                }
            }
        };
    }

    /**
     * Attempts to resolve the best matching track from a search result.
     * @param {object} resolver - The TuneLink client or any object with a resolve() method and options.defaultSearchPlatform
     * @returns {Promise<Track|undefined>}
     */
    async resolve(resolver) {
        await new Promise((res) => setTimeout(res, 0));
        const query = [this.info.author, this.info.title].filter((x) => !!x).join(" - ");
        const result = await resolver.resolve({ query, source: resolver.options.defaultSearchPlatform, requester: this.info.requester });
        if (!result || !result.tracks.length) {
            return;
        }
        const officialAudio = result.tracks.find((track) => {
            const author = [this.info.author, `${this.info.author} - Topic`];
            return author.some((name) => new RegExp(`^${escapeRegExp(name)}$`, "i").test(track.info.author)) ||
                new RegExp(`^${escapeRegExp(this.info.title)}$`, "i").test(track.info.title);
        });
        if (officialAudio) {
            this.info.identifier = officialAudio.info.identifier;
            this.track = officialAudio.track;
            return this;
        }
        if (this.info.length) {
            const sameDuration = result.tracks.find((track) => track.info.length >= (this.info.length ? this.info.length : 0) - 2000 &&
                track.info.length <= (this.info.length ? this.info.length : 0) + 2000);
            if (sameDuration) {
                this.info.identifier = sameDuration.info.identifier;
                this.track = sameDuration.track;
                return this;
            }
            const sameDurationAndTitle = result.tracks.find((track) => track.info.title === this.info.title && track.info.length >= (this.info.length ? this.info.length : 0) - 2000 && track.info.length <= (this.info.length ? this.info.length : 0) + 2000);
            if (sameDurationAndTitle) {
                this.info.identifier = sameDurationAndTitle.info.identifier;
                this.track = sameDurationAndTitle.track;
                return this;
            }
        }
        this.info.identifier = result.tracks[0].info.identifier;
        this.track = result.tracks[0].track;
        return this;
    }
}

module.exports = { Track }; 