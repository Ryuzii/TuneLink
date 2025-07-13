// Player.js
// Handles playback, autoPause, autoResume, and VC logic

const { EventEmitter } = require('tseep');
const { Connection } = require("./Connection");
const { Filters } = require("./Filters");
const { Queue } = require("./Queue");
const { scAutoPlay, spAutoPlay } = require('../handlers/autoPlay');
const { inspect } = require("util");

let lrclibClient = null;
try {
    const { Client } = require('lrclib-api');
    lrclibClient = new Client();
} catch (error) {
    console.warn('lrclib-api not installed. Lyrics functionality will be disabled.');
}

/**
 * Player class for handling playback, autoPause, autoResume, and VC logic
 *
 * Events:
 *   - 'trackStart': (player, track, payload) => void
 *   - 'autoResume': (player, track, payload) => void // Emitted only when playback resumes due to auto-resume (failover/reconnect)
 *   - ...
 */
class Player extends EventEmitter {
    /**
     * @param {object} node - The Lavalink node
     * @param {object} options - Player options (guildId, textChannel, voiceChannel, etc.)
     * @param {object} [emitter] - Optional event emitter or logger for debug/events
     * @param {function} [send] - Function to send gateway payloads
     * @param {function} [resolve] - Function to resolve tracks
     */
    constructor(node, options, emitter, send, resolve) {
        super();
        this.node = node;
        this.options = options;
        this.guildId = options.guildId;
        this.textChannel = options.textChannel;
        this.voiceChannel = options.voiceChannel;
        this.connection = new Connection(this);
        this.filters = new Filters(this);
        this.mute = options.mute ?? false;
        this.deaf = options.deaf ?? false;
        this.volume = options.defaultVolume ?? 100;
        this.loop = options.loop ?? "none";
        this.data = {};
        this.queue = new Queue();
        this.position = 0;
        this.current = null;
        this.previousTracks = [];
        this.playing = false;
        this.paused = false;
        this.connected = false;
        this.timestamp = Date.now();
        this.ping = 0;
        this.isAutoplay = (emitter && emitter.betterAutoPlay) ? true : false;
        this.updateQueue = [];
        this.updateTimeout = null;
        this.batchUpdates = true;
        this.batchDelay = 25;
        this.emitter = emitter;
        this.sendGateway = send;
        this.resolveTrack = resolve;
        this.autoResumeState = {
            enabled: options.autoResume ?? false,
            lastTrack: null,
            lastPosition: 0,
            lastVolume: this.volume,
            lastFilters: null,
            lastUpdate: Date.now()
        };
        this.on("playerUpdate", (packet) => {
            this.connected = packet.state.connected;
            this.position = packet.state.position;
            this.ping = packet.state.ping;
            this.timestamp = packet.state.time || Date.now();
            this.emitter && this.emitter.emit && this.emitter.emit("playerUpdate", this, packet);
        });
        this.on("event", (data) => {
            this.handleEvent(data)
        });
    }
    get previous() {
     return this.previousTracks?.[0]
    }
    async getLyrics(queryOverride = null) {
        if (!this.current && !queryOverride) {
            return { error: 'No track is currently playing.' };
        }
        if (!lrclibClient) {
            return { error: 'Lyrics functionality not available. Install lrclib-api package.' };
        }
        try {
            let query;
            if (queryOverride) {
                query = { ...queryOverride };
            } else {
                const info = this.current.info;
                let author = info.author;
                if (!author && info.requester && info.requester.username) {
                    author = info.requester.username;
                }
                if (!author) {
                    author = 'Unknown Artist';
                }
                query = {
                    track_name: info.title,
                    artist_name: author
                };
                if (info.pluginInfo?.albumName) {
                    query.album_name = info.pluginInfo.albumName;
                }
            }
            this.emitter && this.emitter.emit && this.emitter.emit('debug', this.guildId, `Lyrics query: ${JSON.stringify(query)}`);
            if (!query.track_name || !query.artist_name) {
                return { error: 'Track information incomplete.' };
            }
            const meta = await lrclibClient.findLyrics(query);
            if (!meta) {
                return { error: 'Lyrics not found for this track.' };
            }
            const result = {
                metadata: {
                    id: meta.id,
                    trackName: meta.trackName,
                    artistName: meta.artistName,
                    albumName: meta.albumName,
                    duration: meta.duration,
                    instrumental: meta.instrumental
                }
            };
            if (meta.syncedLyrics) {
                result.syncedLyrics = meta.syncedLyrics;
                result.lyrics = meta.plainLyrics;
            } else if (meta.plainLyrics) {
                result.lyrics = meta.plainLyrics;
            } else {
                return { error: 'No lyrics available for this track.' };
            }
            return result;
        } catch (error) {
            this.emitter && this.emitter.emit && this.emitter.emit('debug', this.guildId, `Lyrics fetch error: ${error.message}`);
            return { error: `Failed to fetch lyrics: ${error.message}` };
        }
    }
    getCurrentLyricLine(syncedLyrics, currentTimeMs = this.position) {
        if (!syncedLyrics || !currentTimeMs) {
            return '';
        }
        try {
            const lines = syncedLyrics.split('\n');
            let currentLine = '';
            for (const line of lines) {
                const timeMatch = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\]/);
                if (timeMatch) {
                    const minutes = parseInt(timeMatch[1]);
                    const seconds = parseInt(timeMatch[2]);
                    const centiseconds = parseInt(timeMatch[3]);
                    const lineTimeMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;
                    if (currentTimeMs >= lineTimeMs) {
                        currentLine = line.replace(/\[\d{2}:\d{2}\.\d{2}\]/, '').trim();
                    } else {
                        break;
                    }
                }
            }
            return currentLine;
        } catch (error) {
            this.emitter && this.emitter.emit && this.emitter.emit('debug', this.guildId, `Lyric line parsing error: ${error.message}`);
            return '';
        }
    }
    addToPreviousTrack(track) {
      if (Number.isInteger(this.options.multipleTrackHistory) && this.previousTracks.length >= this.options.multipleTrackHistory) {
        this.previousTracks.splice(this.options.multipleTrackHistory, this.previousTracks.length);
      } else if(!this.options.multipleTrackHistory) {
       this.previousTracks[0] = track;
       return;
      }
      this.previousTracks.unshift(track)
    }
    queueUpdate(updateData) {
        if (!this.batchUpdates) {
            this.performUpdate(updateData);
            return;
        }
        this.updateQueue.push({
            ...updateData,
            timestamp: Date.now()
        });
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(() => {
            this.processUpdateQueue();
        }, this.batchDelay);
    }
    async processUpdateQueue() {
        if (this.updateQueue.length === 0) return;
        const mergedUpdate = {};
        for (const update of this.updateQueue) {
            Object.assign(mergedUpdate, update);
        }
        this.updateQueue = [];
        try {
            await this.performUpdate(mergedUpdate);
        } catch (error) {
            this.emitter && this.emitter.emit && this.emitter.emit('playerError', this, error);
        }
    }
    async performUpdate(updateData) {
        try {
            await this.node.rest.updatePlayer({
                guildId: this.guildId,
                data: updateData,
            });
        } catch (error) {
            this.emitter && this.emitter.emit && this.emitter.emit('playerError', this, error);
            throw error;
        }
    }
    async play(position = 0) {
        try {
            if (!this.connected) {
                // If auto-resume is in progress, skip error and just return
                if (this.autoResumeState && this.autoResumeState.enabled) {
                    this.emitter && this.emitter.emit && this.emitter.emit('debug', this.guildId, 'Auto-resume: play() called before connection established, skipping.');
                    return this;
                }
                throw new Error("Player connection is not initiated. Use createConnection() and establish a connection.");
            }
        if (!this.queue.length) return;
        this.current = this.queue.shift();
        if (!this.current.track && this.resolveTrack) {
            this.current = await this.current.resolve(this.resolveTrack);
        }
        this.playing = true;
        this.position = position;
        this.timestamp = Date.now();
        const { track } = this.current;
        this.queueUpdate({
            track: {
                encoded: track,
            },
            position, // Pass position to Lavalink if supported
        });
        return this;
        } catch (err) {
            this.emitter && this.emitter.emit && this.emitter.emit('playerError', this, err);
            throw err;
        }
    }
    async restart() {
        try {
        if (!this.current || !this.connected) return;
            const resumePosition = this.autoResumeState.lastPosition || this.position;
        const data = {
        track: { encoded: this.current.track },
                position: resumePosition,
        paused: this.paused,
        volume: this.volume,
        };
        if (this.filters && typeof this.filters.getPayload === "function") {
        const filterPayload = this.filters.getPayload();
        if (filterPayload && Object.keys(filterPayload).length > 0) {
            data.filters = filterPayload;
        }
        }
        // Set flag to indicate next TrackStartEvent is from autoResume
        this._pendingAutoResume = true;
        await this.node.rest.updatePlayer({
        guildId: this.guildId,
        data,
        });
            this.position = resumePosition;
        this.playing = !this.paused;
            this.autoResumeState.lastUpdate = Date.now();
            this.emitter && this.emitter.emit && this.emitter.emit("debug", this.guildId, `Player state restored after node reconnect (autoResume) at position ${resumePosition}ms`);
        } catch (err) {
            this.emitter && this.emitter.emit && this.emitter.emit('playerError', this, err);
            throw err;
        }
    }
    saveAutoResumeState() {
        if (!this.autoResumeState.enabled) return;
        this.autoResumeState = {
            ...this.autoResumeState,
            lastTrack: this.current,
            lastPosition: this.position,
            lastVolume: this.volume,
            lastFilters: this.filters.getPayload ? this.filters.getPayload() : null,
            lastUpdate: Date.now()
        };
    }
    clearAutoResumeState() {
        this.autoResumeState = {
            enabled: this.autoResumeState.enabled,
            lastTrack: null,
            lastPosition: 0,
            lastVolume: this.volume,
            lastFilters: null,
            lastUpdate: Date.now()
        };
    }
    async autoplay(player) {
        if (!player) {
            if (player == null) {
                this.isAutoplay = false;
                return this;
            } else if (player == false) {
                this.isAutoplay = false;
                return this;
            } else throw new Error("Missing argument. Quick Fix: player.autoplay(player)");
        }
        if (!this.connected) {
            this.emitter && this.emitter.emit && this.emitter.emit("debug", this.guildId, "Player disconnected from voice, skipping autoplay");
            return this;
        }
        this.isAutoplay = true;
        if (player.previous) {
            if (player.previous.info.sourceName === "youtube") {
                try {
                    let data = `https://www.youtube.com/watch?v=${player.previous.info.identifier}&list=RD${player.previous.info.identifier}`;
                    let response = this.resolveTrack && await this.resolveTrack({ query: data, source: "ytmsearch", requester: player.previous.info.requester });
                    if (this.node.rest.version === "v4") {
                        if (!response || !response.tracks || ["error", "empty"].includes(response.loadType)) return this.stop();
                    } else {
                        if (!response || !response.tracks || ["LOAD_FAILED", "NO_MATCHES"].includes(response.loadType)) return this.stop();
                    }
                    let track = response.tracks[Math.floor(Math.random() * Math.floor(response.tracks.length))];
                    this.queue.push(track);
                    this.play();
                    return this
                } catch (e) {
                    return this.stop();
                }
            } else if (player.previous.info.sourceName === "soundcloud") {
                try {
                    scAutoPlay(player.previous.info.uri).then(async (data) => {
                        if (!this.connected) {
                            this.emitter && this.emitter.emit && this.emitter.emit("debug", this.guildId, "Player disconnected during autoplay, aborting");
                            return;
                        }
                        let response = this.resolveTrack && await this.resolveTrack({ query: data, source: "scsearch", requester: player.previous.info.requester });
                        if (this.node.rest.version === "v4") {
                            if (!response || !response.tracks || ["error", "empty"].includes(response.loadType)) return this.stop();
                        } else {
                            if (!response || !response.tracks || ["LOAD_FAILED", "NO_MATCHES"].includes(response.loadType)) return this.stop();
                        }
                        let track = response.tracks[Math.floor(Math.random() * Math.floor(response.tracks.length))];
                        this.queue.push(track);
                        this.play();
                        return this;
                    })
                } catch (e) {
                    return this.stop();
                }
            } else if (player.previous.info.sourceName === "spotify") {
                try {
                    spAutoPlay(player.previous.info.identifier).then(async (data) => {
                        if (!this.connected) {
                            this.emitter && this.emitter.emit && this.emitter.emit("debug", this.guildId, "Player disconnected during autoplay, aborting");
                            return;
                        }
                        const response = this.resolveTrack && await this.resolveTrack({ query: `https://open.spotify.com/track/${data}`, requester: player.previous.info.requester });
                        if (this.node.rest.version === "v4") {
                            if (!response || !response.tracks || ["error", "empty"].includes(response.loadType)) return this.stop();
                        } else {
                            if (!response || !response.tracks || ["LOAD_FAILED", "NO_MATCHES"].includes(response.loadType)) return this.stop();
                        }
                        let track = response.tracks[Math.floor(Math.random() * Math.floor(response.tracks.length))];
                        this.queue.push(track);
                        this.play();
                        return this;
                    })
                } catch (e) {
                    return this.stop();
                }
            }
        } else return this;
    }
    async connect(options = this) {
        if (!this.node || !this.node.options) throw new Error("No nodes are available.");
        if (this.connected) {
            this.emitter && this.emitter.emit && this.emitter.emit("debug", `Player ${this.guildId} is already connected.`);
            return this;
        }
        const { guildId, voiceChannel, textChannel } = options;
        if (!guildId || !voiceChannel || !textChannel) {
            throw new Error("Missing required options: guildId, voiceChannel, textChannel");
        }
        if (this.connection.connectionState === 'connecting') {
            this.emitter && this.emitter.emit && this.emitter.emit("debug", `Player ${this.guildId} is already connecting.`);
            return this;
        }
        this.connection.connectionState = 'connecting';
        this.voiceChannel = voiceChannel;
        this.textChannel = textChannel;
        try {
            this.sendGateway && this.sendGateway({
                op: 4,
                d: {
                    guild_id: guildId,
                    channel_id: voiceChannel,
                    self_mute: this.mute,
                    self_deaf: this.deaf,
                },
            });
            this.emitter && this.emitter.emit && this.emitter.emit("debug", `Player ${this.guildId} requested to connect to voice channel ${voiceChannel}.`);
        } catch (error) {
            this.connection.connectionState = 'disconnected';
            throw error;
        }
        return this;
    }
    stop() {
        this.position = 0;
        this.playing = false;
        this.timestamp = Date.now();
        this.queueUpdate({
            track: { encoded: null }
        });
        return this;
    }
    pause(toggle = true) {
        this.queueUpdate({
            paused: toggle
        });
        this.playing = !toggle;
        this.paused = toggle;
        this.timestamp = Date.now();
        return this;
    }
    seek(position) {
        this.queueUpdate({
            position: position
        });
        this.position = position;
        this.timestamp = Date.now();
        return this;
    }
    setVolume(volume) {
        if (volume < 0 || volume > 1000) throw new RangeError("Volume must be between 0 and 1000");
        this.queueUpdate({
            volume: volume
        });
        this.volume = volume;
        return this;
    }
    setLoop(mode) {
        if (!["none", "track", "queue"].includes(mode)) throw new RangeError("Loop mode must be 'none', 'track', or 'queue'");
        this.loop = mode;
        return this.loop;
    }
    setTextChannel(channel) {
        this.textChannel = channel;
        return this;
    }
    setVoiceChannel(channel, options) {
        this.voiceChannel = channel;
        this.connection.voiceChannel = channel;
        if (options?.deaf !== undefined) this.deaf = options.deaf;
        if (options?.mute !== undefined) this.mute = options.mute;
        this.sendGateway && this.sendGateway({
            guild_id: this.guildId,
            channel_id: channel,
            self_deaf: this.deaf,
            self_mute: this.mute,
        });
        this.emitter && this.emitter.emit && this.emitter.emit("playerMove", this.voiceChannel, channel);
        return this;
    }
    async disconnect() {
        if (this.connection.connectionState === 'disconnected' || !this.voiceChannel) {
            return this;
        }
        this.pause(true);
        this.playing = false;
        try {
            this.sendGateway && this.sendGateway({
                op: 4,
                d: {
                    guild_id: this.guildId,
                    channel_id: null,
                    self_mute: false,
                    self_deaf: false,
                },
            });
        } catch (error) {
            this.emitter && this.emitter.emit && this.emitter.emit("playerError", this, error);
        }
        this.connection.connectionState = 'disconnected';
        this.connected = false;
        this.voiceChannel = null;
        setTimeout(() => {
            this.emitter && this.emitter.emit && this.emitter.emit("playerDisconnect", this);
        }, 100);
        return this;
    }
    async destroy(disconnect = true) {
        if (disconnect) {
            await this.disconnect();
        }
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }
        this.updateQueue = [];
        try {
            await this.node.rest.destroyPlayer(this.guildId);
            this.emitter && this.emitter.emit && this.emitter.emit("debug", `Player ${this.guildId} destroyed on node ${this.node.options.name}`);
        } catch (error) {
            this.emitter && this.emitter.emit && this.emitter.emit("playerError", this, new Error(`Failed to destroy player on node: ${error.message}`));
        }
        if (this.options.players && this.options.players.has(this.guildId)) {
            this.options.players.delete(this.guildId);
        }
        const nodeName = this.node ? this.node.name : 'unknown';
        this.emitter && this.emitter.emit && this.emitter.emit("playerDestroy", this, nodeName);
    }
    async handleEvent(payload) {
        switch (payload.type) {
            case "TrackStartEvent":
                if (this._pendingAutoResume) {
                    this._pendingAutoResume = false;
                    this.emitter && this.emitter.emit && this.emitter.emit("autoResume", this, this.current, { position: this.position, reason: "AUTO_RESUME" });
                } else {
                    this.trackStart(this, this.current, payload);
                }
                break;
            case "TrackEndEvent":
                this.trackEnd(this, this.current, payload);
                break;
            case "TrackExceptionEvent":
                this.trackError(this, this.current, payload);
                break;
            case "TrackStuckEvent":
                this.trackStuck(this, this.current, payload);
                break;
            case "WebSocketClosedEvent":
                this.socketClosed(this, payload);
                break;
            default:
                this.emitter && this.emitter.emit && this.emitter.emit("debug", this.guildId, `Unknown event type: ${payload.type}`);
        }
    }
    trackStart(player, track, payload) {
        this.playing = true;
        this.timestamp = Date.now();
        this.emitter && this.emitter.emit && this.emitter.emit("trackStart", player, track, payload);
    }
    trackEnd(player, track, payload) {
        this.playing = false;
        this.addToPreviousTrack(track);
        this.emitter && this.emitter.emit && this.emitter.emit("trackEnd", player, track, payload);
        if (payload.reason === "REPLACED") {
            this.emitter && this.emitter.emit && this.emitter.emit("trackEnd", player, track, payload);
            return;
        }
        if (!this.connected) {
            this.emitter && this.emitter.emit && this.emitter.emit("debug", this.guildId, "Player disconnected from voice, skipping next track playback");
            this.emitter && this.emitter.emit && this.emitter.emit("queueEnd", player, track, payload);
            return;
        }
        if (this.loop === "track" && payload.reason !== "STOPPED") {
            this.queue.unshift(track);
            this.play();
            return;
        }
        if (this.loop === "queue" && payload.reason !== "STOPPED") {
            this.queue.push(track);
            this.play();
            return;
        }
        if (this.queue.length > 0) {
            this.play();
            return;
        }
        if (this.isAutoplay) {
            this.autoplay(player);
            return;
        }
        this.emitter && this.emitter.emit && this.emitter.emit("queueEnd", player, track, payload);
    }
    trackError(player, track, payload) {
        this.emitter && this.emitter.emit && this.emitter.emit("trackError", player, track, payload);
    }
    trackStuck(player, track, payload) {
        this.emitter && this.emitter.emit && this.emitter.emit("trackStuck", player, track, payload);
    }
    socketClosed(player, payload) {
        this.emitter && this.emitter.emit && this.emitter.emit("socketClosed", player, payload);
        if (this.autoResumeState.enabled && this.current) {
            setTimeout(() => {
                this.restart();
            }, 1000);
        }
    }
    send(data) {
        this.sendGateway && this.sendGateway(data);
    }
    set(key, value) {
        this.data[key] = value;
        return this;
    }
    get(key) {
        return this.data[key];
    }
    clearData() {
        this.data = {};
      return this;
    }
    toJSON() {
        return {
            guildId: this.guildId,
            textChannel: this.textChannel,
            voiceChannel: this.voiceChannel,
            volume: this.volume,
            loop: this.loop,
            playing: this.playing,
            paused: this.paused,
            connected: this.connected,
            position: this.position,
            timestamp: this.timestamp,
            ping: this.ping,
            current: this.current,
            queue: this.queue,
            previousTracks: this.previousTracks,
            data: this.data,
            autoResumeState: this.autoResumeState
        };
    }
    static fromJSON(node, data, emitter, send, resolve) {
        const player = new Player(node, {
            guildId: data.guildId,
            textChannel: data.textChannel,
            voiceChannel: data.voiceChannel,
            defaultVolume: data.volume,
            loop: data.loop,
        }, emitter, send, resolve);
        player.playing = data.playing;
        player.paused = data.paused;
        player.connected = data.connected;
        player.position = data.position;
        player.timestamp = data.timestamp;
        player.ping = data.ping;
        player.current = data.current;
        if (data.queue && Array.isArray(data.queue)) {
            player.queue.length = 0;
            player.queue.push(...data.queue);
        }
        player.previousTracks = data.previousTracks;
        player.data = data.data;
        player.autoResumeState = data.autoResumeState;
        if (player.autoResumeState && player.position > 0) {
            player.autoResumeState.lastPosition = player.position;
        }
        return player;
    }
    async shuffleQueue() {
        if (this.queue.length <= 1) return this;
        const shuffled = [...this.queue];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        this.queue = shuffled;
        this.emitter && this.emitter.emit && this.emitter.emit("queueShuffle", this);
        return this;
    }
    moveQueueItem(from, to) {
        if (from < 0 || from >= this.queue.length || to < 0 || to >= this.queue.length) return this;
        const item = this.queue.splice(from, 1)[0];
        this.queue.splice(to, 0, item);
        this.emitter && this.emitter.emit && this.emitter.emit("queueMove", this, from, to);
        return this;
    }
    removeQueueItem(index) {
        if (index < 0 || index >= this.queue.length) return this;
        const removed = this.queue.splice(index, 1)[0];
        this.emitter && this.emitter.emit && this.emitter.emit("queueRemove", this, removed, index);
        return this;
    }
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        }
        return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
    }
}

module.exports = { Player }; 