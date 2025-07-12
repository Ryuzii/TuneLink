// TuneLink.js
// Main client for TuneLink

const { EventEmitter } = require("tseep");
const { Node } = require("./Node");
const { Player } = require("./Player");
const { Track } = require("./Track");
const { version: pkgVersion } = require("../../package.json");
const fs = require('fs/promises');

const versions = ["v3", "v4"];

/**
 * TuneLink - Advanced Lavalink Client
 * Features: Low RAM/CPU, performant, easy to use, lightweight, fast, dynamic node failover, autoPause, autoResume, better autoPlay, and more.
 */
class TuneLink extends EventEmitter {
  /**
   * @param {object} client - Your Discord.js/Eris client
   * @param {Array} nodes - Lavalink node configs
   * @param {Object} options - TuneLink options
   * @param {Function} options.send - Function to send payloads to Discord
   * @param {string} [options.defaultSource] - Default search platform (ytm, yt, spsearch, scsearch)
   * @param {boolean} [options.autoPause] - Enable autoPause (pause when VC empty, resume when users join)
   * @param {boolean} [options.autoResume] - Enable true autoResume (resume after disconnect)
   * @param {boolean} [options.dynamicNode] - Enable dynamic node failover
   * @param {boolean} [options.betterAutoPlay] - Enable better autoPlay (track recommendations)
   * @param {number} [options.multipleTrackHistory] - Number of previous tracks to remember
   * @param {boolean} [options.lazyLoad] - Enable lazy loading
   * @param {number} [options.lazyLoadTimeout] - Timeout for lazy loading
   * @param {string} [options.restVersion] - Lavalink REST API version
   * @param {Array} [options.plugins] - Array of TuneLink plugins
   */
  constructor(client, nodes, options) {
    super();
    if (!client) throw new Error("Client is required to initialize TuneLink");
    if (!nodes || !Array.isArray(nodes)) throw new Error(`Nodes are required & Must Be an Array(Received ${typeof nodes}) for to initialize TuneLink`);
    if (!options.send || typeof options.send !== "function") throw new Error("Send function is required to initialize TuneLink");
    this.client = client;
    this.nodes = nodes;
    this.nodeMap = new Map();
    this.players = new Map();
    this.options = options;
    this.clientId = null;
    this.initiated = false;
    this.send = options.send || null;
    // Map short defaultSource to Lavalink search source
    const searchMap = { ytm: 'ytmsearch', yt: 'ytsearch', spsearch: 'spsearch', scsearch: 'scsearch' };
    const userSource = options.defaultSource || options.defaultSearchPlatform || 'ytmsearch';
    this.defaultSearchPlatform = searchMap[userSource] || userSource;
    this.restVersion = options.restVersion || "v3";
    this.tracks = [];
    this.loadType = null;
    this.playlistInfo = null;
    this.pluginInfo = null;
    this.plugins = options.plugins;
    // Support expressive config objects for options
    this.autoPause = typeof options.autoPause === 'object' ? options.autoPause.enabled : !!options.autoPause;
    this.autoResume = typeof options.autoResume === 'object' ? options.autoResume.enabled : !!options.autoResume;
    this.autoResumeKey = (typeof options.autoResume === 'object' && options.autoResume.key) ? options.autoResume.key : null;
    this.betterAutoPlay = typeof options.betterAutoPlay === 'object' ? options.betterAutoPlay.enabled : !!options.betterAutoPlay;
    this.dynamicNode = typeof options.dynamicNode === 'object' ? options.dynamicNode.enabled : !!options.dynamicNode;
    this.regionCache = new Map();
    this.nodeHealthCache = new Map();
    this.cacheTimeout = 30000;
    this.lazyLoad = options.lazyLoad || false;
    this.lazyLoadTimeout = options.lazyLoadTimeout || 5000;
    this.version = pkgVersion;
    if (this.restVersion && !versions.includes(this.restVersion)) throw new RangeError(`${this.restVersion} is not a valid version`);
    // VC presence hooks for autoPause/autoResume
    this._setupVCPresenceHooks();
  }

  /**
   * Setup VC presence hooks for autoPause/autoResume
   * (Call this in your Discord.js/Eris event handler for voice state updates)
   */
  _setupVCPresenceHooks() {
    if (!this.autoPause && !this.autoResume) return;
    // Example: Discord.js event
    if (this.client && this.client.on) {
      this.client.on('voiceStateUpdate', (oldState, newState) => {
        const guildId = newState.guild?.id || oldState.guild?.id;
        if (!guildId) return;
        const player = this.players.get(guildId);
        if (!player) return;
        // Count non-bot users in VC
        const channel = newState.channel || oldState.channel;
        if (!channel) return;
        const nonBotMembers = channel.members.filter(m => !m.user.bot);
        if (this.autoPause && nonBotMembers.size === 0 && player.playing) {
          player.pause(true);
          this.emit('debug', `AutoPaused player in guild ${guildId} (VC empty)`);
        } else if (this.autoResume && nonBotMembers.size > 0 && player.paused) {
          player.pause(false);
          this.emit('debug', `AutoResumed player in guild ${guildId} (users joined VC)`);
        }
      });
    }
    // For Eris, similar logic can be added here
  }

  get leastUsedNodes() {
    return [...this.nodeMap.values()]
      .filter((node) => node.connected)
      .sort((a, b) => {
        const aHealth = this.getNodeHealth(a);
        const bHealth = this.getNodeHealth(b);
        return aHealth.score - bHealth.score;
      });
  }

  getNodeHealth(node) {
    const now = Date.now();
    const cached = this.nodeHealthCache.get(node.name);
    if (cached && (now - cached.timestamp) < this.cacheTimeout) {
      return cached.health;
    }
    const health = node.getHealthStatus();
    const score = this.calculateNodeScore(health);
    this.nodeHealthCache.set(node.name, {
      health: { ...health, score },
      timestamp: now
    });
    return { ...health, score };
  }

  calculateNodeScore(health) {
    let score = 0;
    score += health.penalties * 10;
    score += health.cpuLoad * 100;
    score += health.memoryUsage * 0.5;
    score += health.ping * 0.1;
    score += health.players * 2;
    score += health.playingPlayers * 5;
    return score;
  }

  init(clientId) {
    if (this.initiated) return this;
    this.clientId = clientId;
    this.nodes.forEach((node) => this.createNode(node));
    this.initiated = true;
    this.emit("debug", `TuneLink initialized, connecting to ${this.nodes.length} node(s)`);
    if (this.plugins) {
      this.emit("debug", `Loading ${this.plugins.length} TuneLink plugin(s)`);
      this.plugins.forEach((plugin) => {
        plugin.load(this);
      });
    }
    // Built-in autoResume: load player state and reconnect/resume
    if (this.autoResume && this.autoResumeKey) {
      let restored = false;
      this.on('nodeConnect', () => {
        if (restored) return;
        restored = true;
        this.loadPlayersState(this.autoResumeKey).then(count => {
          this.emit("debug", `Loaded ${count} player states from ${this.autoResumeKey}`);
          for (const player of this.players.values()) {
            if (player.voiceChannel && player.current) {
              // Force connection state to disconnected to ensure connect() triggers a new join
              if (player.connection) player.connection.connectionState = 'disconnected';
              player.connected = false;
              player.connect({
                guildId: player.guildId,
                textChannel: player.textChannel,
                voiceChannel: player.voiceChannel,
                deaf: player.deaf,
              }).then(() => {
                // Wait for the player to be connected before calling restart
                const checkAndRestart = () => {
                  if (player.connected) {
                    if (player.current) {
                      player.restart();
                      if (player.paused) player.pause(true);
                    }
                  } else {
                    setTimeout(checkAndRestart, 250);
                  }
                };
                checkAndRestart();
              }).catch(err => {
                this.emit("debug", `Failed to auto-resume player for guild ${player.guildId}: ${err.message}`);
              });
            }
          }
        });
      });
      // Save player state on SIGINT
      if (!this._autoResumeSigint) {
        this._autoResumeSigint = true;
        process.on('SIGINT', async () => {
          await this.savePlayersState(this.autoResumeKey);
          this.emit("debug", `Saved player states to ${this.autoResumeKey}`);
          process.exit(0);
        });
      }
    }
    return this;
  }

  createNode(options) {
    const node = new Node(options, this.options, this);
    this.nodeMap.set(options.name || options.host, node);
    node.connect();
    // Listen for node disconnects to trigger failover
    node.on('disconnect', () => this._handleNodeDisconnect(node));
    this.emit("nodeCreate", node);
    return node;
  }

  /**
   * Handles node disconnect and moves players to backup node if available
   * @param {Node} node
   */
  _handleNodeDisconnect(node) {
    this.emit('debug', `[TuneLink] Node ${node.name} disconnected, attempting failover...`);
    for (const player of this.players.values()) {
      if (player.node === node) {
        // Find a backup node that is connected and not the failed node
        const backupNode = this.leastUsedNodes.find(n => n !== node && n.connected);
        if (backupNode) {
          this.emit('debug', `[TuneLink] Moving player ${player.guildId} to backup node ${backupNode.name}`);
          // Save player state
          const state = player.toJSON ? player.toJSON() : {};
          const guildId = player.guildId || state.guildId;
          const textChannel = player.textChannel || state.textChannel;
          const voiceChannel = player.voiceChannel || state.voiceChannel;
          const deaf = player.deaf || state.deaf;

          if (!guildId || !voiceChannel || !textChannel) {
            this.emit('debug', `[TuneLink] Failover aborted for player ${player.guildId}: missing guildId, voiceChannel, or textChannel`);
            continue;
          }

          const position = player.position || (state.current && state.current.position) || 0;
          // Destroy old player
          player.destroy();
          // Create new player on backup node
          const newPlayer = this.createPlayer(backupNode, {
            ...state,
            guildId,
            textChannel,
            voiceChannel,
            deaf,
          });
          // Attempt to reconnect and resume playback
          newPlayer.connect({
            guildId,
            textChannel,
            voiceChannel,
            deaf,
          });
          if (state.current) {
            const waitForConnectionAndPlay = (player, position, retries = 20) => {
              if (player.connected) {
                player.play(position);
              } else if (retries > 0) {
                setTimeout(() => waitForConnectionAndPlay(player, position, retries - 1), 250);
              } else {
                this.emit('debug', `[TuneLink] Failover: Player did not connect in time, could not resume playback.`);
              }
            };
            waitForConnectionAndPlay(newPlayer, position);
          }
        } else {
          this.emit('debug', `[TuneLink] No backup node available for player ${player.guildId}`);
        }
      }
    }
  }

  destroyNode(identifier) {
    const node = this.nodeMap.get(identifier);
    if (!node) return;
    node.disconnect();
    this.nodeMap.delete(identifier);
    this.nodeHealthCache.delete(identifier);
    this.emit("nodeDestroy", node);
  }

  updateVoiceState(packet) {
    if (!["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(packet.t)) return;
    const player = this.players.get(packet.d.guild_id);
    if (!player) return;
    if (packet.t === "VOICE_SERVER_UPDATE") {
      player.connection.setServerUpdate(packet.d);
    } else if (packet.t === "VOICE_STATE_UPDATE") {
      if (packet.d.user_id !== this.clientId) return;
      player.connection.setStateUpdate(packet.d);
    }
  }

  fetchRegion(region) {
    const now = Date.now();
    const cacheKey = `region_${region}`;
    const cached = this.regionCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < this.cacheTimeout) {
      return cached.nodes;
    }
    const nodesByRegion = [...this.nodeMap.values()]
      .filter((node) => node.connected && node.regions?.includes(region?.toLowerCase()))
      .sort((a, b) => {
        const aHealth = this.getNodeHealth(a);
        const bHealth = this.getNodeHealth(b);
        return aHealth.score - bHealth.score;
      });
    this.regionCache.set(cacheKey, {
      nodes: nodesByRegion,
      timestamp: now
    });
    return nodesByRegion;
  }

  getBestNodeForRegion(region) {
    const regionNodes = this.fetchRegion(region);
    return regionNodes.length > 0 ? regionNodes[0] : this.leastUsedNodes[0];
  }

  /**
   * Creates a connection (player) for a guild.
   * @param {Object} options - Options for the player (guildId, region, etc.)
   * @returns {Player}
   */
  createConnection(options) {
    if (!this.initiated) throw new Error("You have to initialize TuneLink in your ready event");
    const player = this.players.get(options.guildId);
    if (player) return player;
    if (this.leastUsedNodes.length === 0) throw new Error("No nodes are available");
    let node;
    if (options.region) {
      node = this.getBestNodeForRegion(options.region);
    } else {
      node = this.leastUsedNodes[0];
    }
    if (!node) throw new Error("No nodes are available");
    return this.createPlayer(node, options);
  }

  /**
   * Creates a player instance and connects it.
   * @param {Node} node
   * @param {Object} options
   * @returns {Player}
   */
  createPlayer(node, options) {
    const player = new Player(node, options, this, this.send, this.resolve.bind(this));
    this.players.set(options.guildId, player);
    player.connect(options);
    this.emit('debug', `Created a player (${options.guildId}) on node ${node.name}`);
    this.emit("playerCreate", player);
    return player;
  }

  destroyPlayer(guildId) {
    const player = this.players.get(guildId);
    if (!player) return;
    const nodeName = player.node ? player.node.name : 'unknown';
    player.destroy();
    this.players.delete(guildId);
    this.emit("playerDestroy", player, nodeName);
  }

  removeConnection(guildId) {
    this.players.get(guildId)?.destroy();
    this.players.delete(guildId);
  }

  /**
   * Resolves a search query to tracks using the best node.
   * @param {object} param0
   * @returns {Promise<object>} nodeResponse
   */
  async resolve({ query, source, requester, node }) {
    try {
      if (!this.initiated) throw new Error("You have to initialize TuneLink in your ready event");
      if(node && (typeof node !== "string" && !(node instanceof Node))) throw new Error(`'node' property must either be an node identifier/name('string') or an Node/Node Class, But Received: ${typeof node}`)
      const querySource = source || this.defaultSearchPlatform;
      const requestNode = (node && typeof node === 'string' ? this.nodeMap.get(node) : node) || this.leastUsedNodes[0];
      if (!requestNode) throw new Error("No nodes are available.");
      const regex = /^https?:\/\//;
      const identifier = regex.test(query) ? query : `${querySource}:${query}`;
      this.emit("debug", `Searching for ${query} on node "${requestNode.name}"`);
      let response = await requestNode.rest.makeRequest(`GET`, `/${requestNode.rest.version}/loadtracks?identifier=${encodeURIComponent(identifier)}`);
      if (!response || response.loadType === "error") {
        this.emit("debug", `Search failed for "${query}" on node "${requestNode.name}": ${response?.data?.message || 'Unknown error'}`);
        if (regex.test(query)) {
          this.emit("debug", `Attempting fallback search for "${query}"`);
          const fallbackIdentifier = `${querySource}:${query}`;
          response = await requestNode.rest.makeRequest(`GET`, `/${requestNode.rest.version}/loadtracks?identifier=${encodeURIComponent(fallbackIdentifier)}`);
        }
        if (!response || response.loadType === "error") {
          throw new Error(response?.data?.message || 'Failed to load tracks');
        }
      }
      if (response.loadType === "empty" || response.loadType === "NO_MATCHES") {
        response = await requestNode.rest.makeRequest(`GET`, `/${requestNode.rest.version}/loadtracks?identifier=https://open.spotify.com/track/${query}`);
        if (response.loadType === "empty" || response.loadType === "NO_MATCHES") {
          response = await requestNode.rest.makeRequest(`GET`, `/${requestNode.rest.version}/loadtracks?identifier=https://www.youtube.com/watch?v=${query}`);
        }
      }
      if (requestNode.rest.version === "v4") {
        if (response.loadType === "track") {
          this.tracks = response.data ? [new Track(response.data, requester, requestNode)] : [];
          this.emit("debug", `Search Success for "${query}" on node "${requestNode.name}", loadType: ${response.loadType}, Resulted track Title: ${this.tracks[0].info.title} by ${this.tracks[0].info.author}`);
        } else if (response.loadType === "playlist") {
          const trackData = response.data?.tracks || [];
          this.tracks = await Promise.all(trackData.map((track) => new Track(track, requester, requestNode)));
          this.emit("debug", `Search Success for "${query}" on node "${requestNode.name}", loadType: ${response.loadType} tracks: ${this.tracks.length}`);
        } else {
          const trackData = response.loadType === "search" && response.data ? response.data : [];
          this.tracks = await Promise.all(trackData.map((track) => new Track(track, requester, requestNode)));
          this.emit("debug", `Search ${this.loadType !== "error" ? "Success" : "Failed"} for "${query}" on node "${requestNode.name}", loadType: ${response.loadType} tracks: ${this.tracks.length}`);
        }
      } else {
        const trackData = response?.tracks || [];
        this.tracks = await Promise.all(trackData.map((track) => new Track(track, requester, requestNode)));
        this.emit("debug", `Search ${this.loadType !== "error" && this.loadType !== "LOAD_FAILED" ? "Success" : "Failed"} for "${query}" on node "${requestNode.name}", loadType: ${response.loadType} tracks: ${this.tracks.length}`);
      }
      if (
        requestNode.rest.version === "v4" &&
        response.loadType === "playlist"
      ) {
        this.playlistInfo = response.data?.info || null;
      } else {
        this.playlistInfo = null;
      }
      this.loadType = response.loadType;
      return {
        loadType: response.loadType,
        tracks: this.tracks,
        playlistInfo: this.playlistInfo,
        pluginInfo: this.pluginInfo,
      };
    } catch (error) {
      this.emit("debug", `Search failed for "${query}": ${error.message}`);
      throw error;
    }
  }

  get(guildId) {
    return this.players.get(guildId);
  }

  async search(query, requester, source = this.defaultSearchPlatform) {
    return this.resolve({ query, source, requester });
  }

  getNodesHealth() {
    const health = {};
    for (const [name, node] of this.nodeMap) {
      health[name] = this.getNodeHealth(node);
    }
    return health;
  }

  getSystemHealth() {
    const nodesHealth = this.getNodesHealth();
    const connectedNodes = Object.values(nodesHealth).filter(h => h.connected);
    const totalPlayers = Object.values(nodesHealth).reduce((sum, h) => sum + h.players, 0);
    const totalPlayingPlayers = Object.values(nodesHealth).reduce((sum, h) => sum + h.playingPlayers, 0);
    return {
      totalNodes: Object.keys(nodesHealth).length,
      connectedNodes: connectedNodes.length,
      totalPlayers,
      totalPlayingPlayers,
      averagePing: connectedNodes.length > 0 ? 
        connectedNodes.reduce((sum, h) => sum + h.averagePing, 0) / connectedNodes.length : 0,
      nodesHealth
    };
  }

  clearCaches() {
    this.regionCache.clear();
    this.nodeHealthCache.clear();
    this.emit("debug", "All caches cleared");
  }

  async savePlayersState(filePath) {
    try {
      const playersData = {};
      for (const [guildId, player] of this.players) {
        if (player.current || player.queue.length > 0) {
          playersData[guildId] = player.toJSON();
        }
      }
      await fs.writeFile(filePath, JSON.stringify(playersData, null, 2));
      this.emit("debug", `Saved ${Object.keys(playersData).length} player states to ${filePath}`);
      return playersData;
    } catch (error) {
      this.emit("debug", `Failed to save player states: ${error.message}`);
      throw error;
    }
  }

  async loadPlayersState(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const playersData = JSON.parse(data);
      let loadedCount = 0;
      for (const [guildId, playerData] of Object.entries(playersData)) {
        try {
          const node = this.leastUsedNodes[0];
          if (!node) {
            this.emit("debug", `No available nodes to restore player for guild ${guildId}`);
            continue;
          }
          const player = Player.fromJSON(node, playerData, this, this.send, this.resolve.bind(this));
          this.players.set(guildId, player);
          if (player.autoResumeState.enabled) {
            player.saveAutoResumeState();
          }
          loadedCount++;
          this.emit("playerCreate", player);
          this.emit("debug", `Restored player for guild ${guildId}`);
        } catch (error) {
          this.emit("debug", `Failed to restore player for guild ${guildId}: ${error.message}`);
        }
      }
      this.emit("debug", `Loaded ${loadedCount} player states from ${filePath}`);
      return loadedCount;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.emit("debug", `No player state file found at ${filePath}`);
        return 0;
      }
      this.emit("debug", `Failed to load player states: ${error.message}`);
      throw error;
    }
  }

  destroy() {
    for (const player of this.players.values()) {
      player.destroy();
    }
    this.players.clear();
    for (const node of this.nodeMap.values()) {
      node.destroy();
    }
    this.nodeMap.clear();
    this.clearCaches();
    this.initiated = false;
    this.emit("destroy");
  }
}

module.exports = { TuneLink };