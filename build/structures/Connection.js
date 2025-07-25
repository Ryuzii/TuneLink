// Connection.js
// Enhanced: Supports integration with discord.js and eris for voice state/server updates
// Tracks self-deaf/mute, region, connection state, and batches updates for performance

const { EventEmitter } = require('tseep');

class Connection extends EventEmitter {
  /**
   * @param {import("../index").Player} player
   */
  constructor(player) {
    super();
    this.player = player;
    this.sessionId = null;
    this.voice = {
      sessionId: null,
      event: null,
      endpoint: null,
      token: null,
    };
    this.region = null;
    this.self_deaf = false;
    this.self_mute = false;
    this.voiceChannel = player.voiceChannel;
    this.connectionState = 'disconnected';
    this.lastUpdate = Date.now();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.updateQueue = [];
    this.updateTimeout = null;
    this.batchUpdates = true;
    this.batchDelay = 50; // ms
  }

  /**
   * Call this with the VOICE_SERVER_UPDATE payload from discord.js or eris
   * @param {Object} data
   */
  setServerUpdate(data) {
    const { endpoint, token } = data;
    if (!endpoint) {
      throw new Error(`Missing 'endpoint' property in VOICE_SERVER_UPDATE packet/payload. Wait and try again, or disconnect and rejoin the voice channel.`);
    }
    const previousVoiceRegion = this.region;
    this.voice.endpoint = endpoint;
    this.voice.token = token;
    this.region = this.extractRegion(endpoint);
    this.player.emit && this.player.emit("debug", `[Player ${this.player.guildId} - CONNECTION] Voice server update: ${previousVoiceRegion !== null ? `Region changed from ${previousVoiceRegion} to ${this.region}` : `Connected to ${this.region}`}`);
    // Auto-resume if player was paused during connection
    if (this.player.paused && this.connectionState === 'connecting') {
      this.player.emit && this.player.emit("debug", this.player.node?.name, `Auto-resuming ${this.player.guildId} player after connection`);
      this.player.pause(false);
    }
    this.connectionState = 'connected';
    this.player.connected = true;
    this.lastUpdate = Date.now();
    this.reconnectAttempts = 0;
    this.queueUpdate();
  }

  /**
   * Call this with the VOICE_STATE_UPDATE payload from discord.js or eris
   * @param {Object} data
   */
  setStateUpdate(data) {
    const { session_id, channel_id, self_deaf, self_mute } = data;
    this.player.emit && this.player.emit("debug", `[Player ${this.player.guildId} - CONNECTION] Voice state update: ${channel_id !== null ? `Connected to ${this.voiceChannel}` : `Disconnected from ${this.voiceChannel}`}`);
    // Handle disconnection
    if (channel_id == null) {
      this.connectionState = 'disconnected';
      this.player.connected = false;
      this.player.emit && this.player.emit("playerDisconnect", this.player);
      this.player.destroy && this.player.destroy();
      return;
    }
    // Handle channel move
    if (this.player.voiceChannel && channel_id && this.player.voiceChannel !== channel_id) {
      this.player.emit && this.player.emit("playerMove", this.player.voiceChannel, channel_id);
      this.player.voiceChannel = channel_id;
      this.voiceChannel = channel_id;
    }
    this.self_deaf = self_deaf;
    this.self_mute = self_mute;
    this.voice.sessionId = session_id || null;
    this.connectionState = 'connected';
    this.player.connected = true;
    this.lastUpdate = Date.now();
  }

  // Extract region from endpoint
  extractRegion(endpoint) {
    if (!endpoint) return null;
    const methods = [
      () => endpoint.split(".").shift()?.replace(/[0-9]/g, ""),
      () => endpoint.match(/([a-z]+)[0-9]*\.discord\.com/)?.[1],
      () => endpoint.split(".")[0]?.replace(/[0-9]/g, ""),
    ];
    for (const method of methods) {
      const region = method();
      if (region && region.length > 0) {
        return region.toLowerCase();
      }
    }
    return 'unknown';
  }

  // Queue updates for better performance
  queueUpdate() {
    if (!this.batchUpdates) {
      this.updatePlayerVoiceData();
      return;
    }
    this.updateQueue.push({
      voice: { ...this.voice },
      volume: this.player.volume,
      timestamp: Date.now()
    });
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    this.updateTimeout = setTimeout(() => {
      this.processUpdateQueue();
    }, this.batchDelay);
  }

  // Process batched updates
  async processUpdateQueue() {
    if (this.updateQueue.length === 0) return;
    const latestUpdate = this.updateQueue[this.updateQueue.length - 1];
    this.updateQueue = [];
    try {
      await this.updatePlayerVoiceData(latestUpdate);
    } catch (error) {
      this.player.emit && this.player.emit("debug", `[Connection] Failed to process update queue: ${error.message}`);
      // Retry with exponential backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.pow(2, this.reconnectAttempts) * 1000;
        setTimeout(() => {
          this.queueUpdate();
        }, delay);
      }
    }
  }

  // Actually send the update to Lavalink via the node's REST manager
  async updatePlayerVoiceData(updateData = null) {
    const data = updateData || {
      voice: this.voice,
      volume: this.player.volume,
    };
    this.player.emit && this.player.emit("debug", this.player.node?.name, `[Rest Manager] Updating player with voice data: ${JSON.stringify({ voice: data.voice })}`);
    try {
      await this.player.node.rest.updatePlayer({
        guildId: this.player.guildId,
        data: Object.assign({
          voice: data.voice,
          volume: data.volume,
        }),
      });
      this.lastUpdate = Date.now();
      this.reconnectAttempts = 0;
    } catch (error) {
      this.player.emit && this.player.emit("debug", `[Connection] Failed to update player: ${error.message}`);
      throw error;
    }
  }

  // Get connection health status
  getHealthStatus() {
    const now = Date.now();
    const timeSinceUpdate = now - this.lastUpdate;
    return {
      state: this.connectionState,
      region: this.region,
      lastUpdate: this.lastUpdate,
      timeSinceUpdate,
      reconnectAttempts: this.reconnectAttempts,
      isHealthy: timeSinceUpdate < 30000 && this.connectionState === 'connected'
    };
  }

  // Force immediate update (bypass batching)
  forceUpdate() {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    this.updateQueue = [];
    return this.updatePlayerVoiceData();
  }

  // Cleanup method
  destroy() {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    this.updateQueue = [];
    this.connectionState = 'destroyed';
  }
}

module.exports = { Connection }; 