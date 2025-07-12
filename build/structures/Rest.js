// Rest.js
// Handles Lavalink REST API communication

const { fetch: undiciFetch, Agent } = require("undici");

/**
 * Handles Lavalink REST API communication for TuneLink.
 * Uses undici for high performance, batching, and caching.
 * @class Rest
 */
class Rest {
  /**
   * @param {object} options - Node options (host, port, password, secure, sessionId, restVersion)
   * @param {object} [emitter] - Optional event emitter or logger for debug events
   */
  constructor(options, emitter) {
    this.emitter = emitter;
    this.url = `http${options.secure ? "s" : ""}://${options.host}:${options.port}`;
    this.sessionId = options.sessionId;
    this.password = options.password;
    this.version = options.restVersion;
    try {
      this.agent = new Agent({
        pipelining: 1,
        connections: 100,
        tls: { rejectUnauthorized: false },
        connect: { timeout: 10000 },
        keepAliveTimeout: 60000,
        keepAliveMaxTimeout: 300000,
        allowH2: true,
        maxConcurrentStreams: 100,
        bodyTimeout: 30000,
        headersTimeout: 10000,
      });
    } catch (error) {
      this.emitter && this.emitter.emit && this.emitter.emit("debug", `Failed to create agent: ${error.message}, falling back to default`);
      this.agent = null;
    }
    this.pendingRequests = new Map();
    this.batchTimeout = null;
    this.batchDelay = 10;
    this.cache = new Map();
    this.cacheTimeout = 30000;
    this.trackCache = new Map();
    this.trackCacheTimeout = 300000;
    this.nodeInfoCache = new Map();
    this.nodeInfoCacheTimeout = 60000;
  }

  /**
   * Set the session ID for this REST instance.
   * @param {string} sessionId
   */
  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  /**
   * Batch requests for better performance.
   */
  async batchRequest(method, endpoint, body = null, includeHeaders = false) {
    const key = `${method}:${endpoint}:${JSON.stringify(body)}`;
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }
    const promise = this.makeRequest(method, endpoint, body, includeHeaders);
    this.pendingRequests.set(key, promise);
    promise.finally(() => {
      this.pendingRequests.delete(key);
    });
    return promise;
  }

  /**
   * Make a REST request to Lavalink.
   */
  async makeRequest(method, endpoint, body = null, includeHeaders = false) {
    const startTime = Date.now();
    try {
      const headers = {
        'Authorization': this.password,
        'Content-Type': 'application/json',
        'User-Agent': `TuneLink/${this.version}`
      };
      const requestOptions = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      };
      if (this.agent) requestOptions.dispatcher = this.agent;
      const response = await undiciFetch(this.url + endpoint, requestOptions);
      const responseTime = Date.now() - startTime;
      this.emitter && this.emitter.emit && this.emitter.emit(
        "debug",
        `[Rest] ${method} ${endpoint.startsWith("/") ? endpoint : `/${endpoint}`} ${body ? `body: ${JSON.stringify(body)}` : ""} -> Status: ${response.status} (${responseTime}ms)`
      );
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        this.emitter && this.emitter.emit && this.emitter.emit("debug", `[Rest Error] ${method} ${endpoint} failed: ${response.status} - ${errorData.message || 'Unknown error'}`);
        throw new Error(`HTTP ${response.status}: ${errorData.message || 'Request failed'}`);
      }
      const data = await this.parseResponse(response);
      if (method === 'GET' && response.ok) {
        const cacheKey = `${method}:${endpoint}`;
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
      }
      return includeHeaders === true ? {
        data,
        headers: response.headers,
        responseTime
      } : data;
    } catch (error) {
      this.emitter && this.emitter.emit && this.emitter.emit("debug", `Request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse the response from Lavalink.
   */
  async parseResponse(response) {
    try {
      if (response.status === 204) {
        return null;
      }
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      this.emitter && this.emitter.emit && this.emitter.emit("debug", `[Rest - Error] Parse error: ${error.message}`);
      return null;
    }
  }

  /**
   * Update a player on Lavalink.
   */
  async updatePlayer(options) {
    const { guildId, data } = options;
    return this.makeRequest(
      "PATCH",
      `/${this.version}/sessions/${this.sessionId}/players/${guildId}`,
      data
    );
  }

  /**
   * Destroy a player on Lavalink.
   */
  async destroyPlayer(guildId) {
    return this.makeRequest(
      "DELETE",
      `/${this.version}/sessions/${this.sessionId}/players/${guildId}`
    );
  }

  /**
   * Get all players for this session.
   */
  async getPlayers() {
    return this.makeRequest(
      "GET",
      `/${this.version}/sessions/${this.sessionId}/players`
    );
  }

  /**
   * Load tracks from Lavalink.
   */
  async getTracks(identifier) {
    const cacheKey = `tracks:${identifier}`;
    const cached = this.trackCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.trackCacheTimeout) {
      this.emitter && this.emitter.emit && this.emitter.emit("debug", `[Rest Cache] Track cache hit for ${identifier}`);
      return cached.data;
    }
    const result = await this.makeRequest(
      "GET",
      `/${this.version}/loadtracks?identifier=${encodeURIComponent(identifier)}`
    );
    this.trackCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    return result;
  }

  /**
   * Decode a single track.
   */
  async decodeTrack(track) {
    return this.makeRequest(
      "GET",
      `/${this.version}/decodetrack?encodedTrack=${encodeURIComponent(track)}`
    );
  }

  /**
   * Decode multiple tracks.
   */
  async decodeTracks(tracks) {
    return this.makeRequest(
      "POST",
      `/${this.version}/decodetracks`,
      { tracks }
    );
  }

  /**
   * Get Lavalink node stats.
   */
  async getStats() {
    return this.makeRequest("GET", `/${this.version}/stats`);
  }

  /**
   * Get Lavalink node info.
   */
  async getInfo() {
    return this.makeRequest("GET", `/${this.version}/info`);
  }
}

module.exports = Rest; 