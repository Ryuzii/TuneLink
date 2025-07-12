// TuneLink TypeScript Definitions
import { EventEmitter } from 'events';

export interface TuneLinkOptions {
  defaultSource?: 'ytm' | 'yt' | 'spsearch' | 'scsearch';
  autoPause?: boolean;
  autoResume?: boolean;
  dynamicNode?: boolean;
  betterAutoPlay?: boolean;
  multipleTrackHistory?: number;
  lazyLoad?: boolean;
  lazyLoadTimeout?: number;
  restVersion?: string;
  plugins?: Plugin[];
  send: (payload: any) => void;
}

export interface LavalinkNodeOptions {
  host: string;
  port: number;
  password: string;
  secure?: boolean;
  name?: string;
  regions?: string[];
  sessionId?: string;
}

export interface TrackInfo {
  identifier: string;
  seekable: boolean;
  author: string;
  length: number;
  stream: boolean;
  position: number;
  title: string;
  uri?: string;
  requester?: any;
  sourceName: string;
  isrc?: string;
  thumbnail?: string;
}

export interface Track {
  track: string;
  info: TrackInfo;
}

export interface QueueItem {
  track: Track;
  requestedBy?: string;
}

export interface PlayerOptions {
  guildId: string;
  textChannel: string;
  voiceChannel: string;
  [key: string]: any;
}

export interface NodeHealth {
  connected: boolean;
  uptime: number;
  ping: number;
  averagePing: number;
  penalties: number;
  players: number;
  playingPlayers: number;
  cpuLoad: number;
  memoryUsage: number;
  score: number;
}

export interface Plugin {
  load(client: TuneLink): void;
}

export interface ResolveResult {
  loadType: string;
  tracks: Track[];
  playlistInfo?: any;
  pluginInfo?: any;
}

export class TuneLink extends EventEmitter {
  constructor(client: any, nodes: LavalinkNodeOptions[], options: TuneLinkOptions);
  client: any;
  nodes: LavalinkNodeOptions[];
  nodeMap: Map<string, Node>;
  players: Map<string, Player>;
  options: TuneLinkOptions;
  clientId: string | null;
  initiated: boolean;
  send: (payload: any) => void;
  defaultSearchPlatform: string;
  restVersion: string;
  tracks: Track[];
  loadType: string | null;
  playlistInfo: any;
  pluginInfo: any;
  plugins: Plugin[];
  autoPause: boolean;
  autoResume: boolean;
  dynamicNode: boolean;
  betterAutoPlay: boolean;
  regionCache: Map<string, any>;
  nodeHealthCache: Map<string, any>;
  cacheTimeout: number;
  lazyLoad: boolean;
  lazyLoadTimeout: number;
  version: string;
  init(clientId: string): this;
  createNode(options: LavalinkNodeOptions): Node;
  destroyNode(identifier: string): void;
  updateVoiceState(packet: any): void;
  fetchRegion(region: string): Node[];
  getBestNodeForRegion(region: string): Node;
  createConnection(options: PlayerOptions): Player;
  createPlayer(node: Node, options: PlayerOptions): Player;
  destroyPlayer(guildId: string): void;
  removeConnection(guildId: string): void;
  resolve(params: { query: string; source?: string; requester?: any; node?: string | Node }): Promise<ResolveResult>;
  get(guildId: string): Player | undefined;
  search(query: string, requester: any, source?: string): Promise<ResolveResult>;
  getNodesHealth(): Record<string, NodeHealth>;
  getSystemHealth(): any;
  clearCaches(): void;
  savePlayersState(filePath: string): Promise<any>;
  loadPlayersState(filePath: string): Promise<number>;
  destroy(): void;
}

export class Node {
  constructor(node: LavalinkNodeOptions, options?: any, emitter?: any);
  name: string;
  host: string;
  port: number;
  password: string;
  restVersion: string;
  secure: boolean;
  sessionId: string | null;
  rest: Rest;
  wsUrl: string;
  restUrl: string;
  ws: any;
  regions: string[];
  info: any;
  stats: any;
  connected: boolean;
  resumeKey: string | null;
  resumeTimeout: number;
  autoResume: boolean;
  autoResumePlayers: Map<string, any>;
  connect(): Promise<void>;
  destroy(clean?: boolean): void;
  disconnect(): void;
  getHealthStatus(): NodeHealth;
}

export class Player extends EventEmitter {
  constructor(node: Node, options: PlayerOptions, emitter?: any, send?: Function, resolve?: Function);
  node: Node;
  options: PlayerOptions;
  guildId: string;
  textChannel: string;
  voiceChannel: string;
  connection: Connection;
  filters: any;
  mute: boolean;
  deaf: boolean;
  volume: number;
  loop: 'none' | 'track' | 'queue';
  data: Record<string, any>;
  queue: Queue;
  position: number;
  current: Track | null;
  previousTracks: Track[];
  playing: boolean;
  paused: boolean;
  connected: boolean;
  timestamp: number;
  ping: number;
  isAutoplay: boolean;
  play(): Promise<this>;
  restart(): Promise<void>;
  saveAutoResumeState(): void;
  clearAutoResumeState(): void;
  autoplay(player: Player): Promise<this>;
  connect(options?: PlayerOptions): Promise<this>;
  stop(): this;
  pause(toggle?: boolean): this;
  seek(position: number): this;
  setVolume(volume: number): this;
  setLoop(mode: 'none' | 'track' | 'queue'): 'none' | 'track' | 'queue';
  setTextChannel(channel: string): this;
  setVoiceChannel(channel: string, options?: { deaf?: boolean; mute?: boolean }): this;
  disconnect(): Promise<this | void>;
  destroy(disconnect?: boolean): Promise<void>;
  shuffleQueue(): Promise<this>;
  moveQueueItem(from: number, to: number): this;
  removeQueueItem(index: number): this;
  formatDuration(ms: number): string;
  getLyrics(queryOverride?: any): Promise<any>;
  getCurrentLyricLine(syncedLyrics: string, currentTimeMs?: number): string;
  addToPreviousTrack(track: Track): void;
  set(key: string, value: any): this;
  get(key: string): any;
  clearData(): this;
  toJSON(): any;
  // static fromJSON
  static fromJSON(node: Node, data: any, emitter?: any, send?: Function, resolve?: Function): Player;
}

export class Track {
  constructor(data: any, requester: any, node: Node);
  rawData: any;
  track: string;
  info: TrackInfo;
  resolve(resolver: any): Promise<Track | undefined>;
}

export class Queue extends Array<Track> {
  add(track: Track): this;
  addMultiple(tracks: Track[]): this;
  remove(index: number): Track | null;
  clear(): void;
  shuffle(): this;
  shuffleAsync(): Promise<this>;
  move(from: number, to: number): this;
  getRange(start: number, end: number): Track[];
  findTrack(criteria: ((track: Track) => boolean) | string): Track | undefined;
  removeTracks(criteria: ((track: Track) => boolean) | string): Track[];
  getStats(): any;
  reverse(): this;
  getBySource(source: string): Track[];
  getByArtist(artist: string): Track[];
  getByTitle(title: string): Track[];
  insert(index: number, track: Track): this;
  swap(index1: number, index2: number): this;
  getRandom(): Track | null;
  getRandomMultiple(count: number): Track[];
  toArray(): Track[];
  toJSON(): any;
  static from(array: any[]): Queue;
  addBatch(tracks: Track[]): this;
  addPlaylist(tracks: Track[], playlistInfo?: any): this;
}

export class Rest {
  constructor(options: any, emitter?: any);
  setSessionId(sessionId: string): void;
  batchRequest(method: string, endpoint: string, body?: any, includeHeaders?: boolean): Promise<any>;
  makeRequest(method: string, endpoint: string, body?: any, includeHeaders?: boolean): Promise<any>;
  updatePlayer(options: { guildId: string; data: any }): Promise<any>;
  destroyPlayer(guildId: string): Promise<any>;
  getPlayers(): Promise<any>;
  getTracks(identifier: string): Promise<any>;
  decodeTrack(track: string): Promise<any>;
  decodeTracks(tracks: string[]): Promise<any>;
  getStats(): Promise<any>;
  getInfo(): Promise<any>;
}

export class Connection {
  constructor(player: Player);
  setServerUpdate(data: any): void;
  setStateUpdate(data: any): void;
  extractRegion(endpoint: string): string | null;
  queueUpdate(): void;
  processUpdateQueue(): Promise<void>;
  updatePlayerVoiceData(updateData?: any): Promise<void>;
  getHealthStatus(): any;
  forceUpdate(): Promise<void>;
  destroy(): void;
}

export namespace autoPlay {
  function scAutoPlay(url: string, opts?: { maxTracks?: number }): Promise<string | null>;
  function spAutoPlay(track_id: string, opts?: { market?: string; clientId?: string; clientSecret?: string }): Promise<string | null>;
}

export namespace fetchImage {
  function getImageUrl(info: { sourceName: string; identifier: string; uri?: string }): Promise<string | null>;
} 