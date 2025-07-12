// test/bot.js
// Simple test bot for TuneLink
// Requires: discord.js v14+, TuneLink, Lavalink node running
// Usage: Set DISCORD_TOKEN and LAVALINK config below, then run: node test/bot.js

const { Client, GatewayIntentBits } = require('discord.js');
const { TuneLink } = require('../build');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'TOKEN';
const LAVALINK_NODES = [
    {
        name: "test2",
        password: "DevamOP",
        host: "lavalink.devxcode.in",
        port: 443,
        secure: true,
    },
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const music = new TuneLink(client, LAVALINK_NODES, {
  send: (payload) => {
    const guild = client.guilds.cache.get(payload.d.guild_id);
    if (guild) {
      guild.shard.send(payload);
    }
  },
  restVersion: 'v4',
  defaultSource: 'ytm',
  autoPause: { 
    enabled: true 
  },
  autoResume: { 
    enabled: true, 
    key: 'playerState.json' 
  },
  betterAutoPlay: { 
    enabled: true 
  },
  dynamicNode: { 
    enabled: true 
  },
});

// Load player state on startup if autoResume.key is set
if (music.autoResumeKey) {
  music.loadPlayersState(music.autoResumeKey).then(count => {
    console.log(`[TuneLink] Loaded ${count} player states from ${music.autoResumeKey}`);
  });
}

// Save player state on process exit if autoResume.key is set
process.on('SIGINT', async () => {
  if (music.autoResumeKey) {
    await music.savePlayersState(music.autoResumeKey);
    console.log(`[TuneLink] Saved player states to ${music.autoResumeKey}`);
  }
  process.exit(0);
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  music.init(client.user.id);
});

music.on('debug', (...args) => console.log('[TuneLink]', ...args.filter(x => x !== undefined)));
music.on('playerCreate', player => console.log(`[TuneLink] Player created for guild ${player.guildId}`));
music.on('playerDestroy', (player, nodeName) => console.log(`[TuneLink] Player ${player.guildId} destroyed on node ${nodeName}`));

// Play event listeners
music.on('trackStart', (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);
  if (channel) {
    channel.send(`▶️ Now playing: **${track.info.title}**`);
  }
});
music.on('queueEnd', (player) => {
  const channel = client.channels.cache.get(player.textChannel);
  if (channel) {
    channel.send('✅ Queue has ended. Add more songs with `!play <song>`!');
  }
});

// Example: Play command (prefix !play)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('!play ')) return;

  const query = message.content.slice('!play '.length).trim();
  if (!query) return message.reply('Please provide a search query or URL!');

  const member = message.member;
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) {
    return message.reply('You must be in a voice channel!');
  }

  let player = music.get(message.guildId);
  if (!player) {
    player = music.createConnection({
      guildId: message.guildId,
      voiceChannel: voiceChannel.id,
      textChannel: message.channelId,
      deaf: true
    });
  }

  let result;
  try {
    result = await music.resolve({
      query,
      requester: message.author
    });
  } catch (err) {
    return message.reply(`❌ Search failed: ${err.message}`);
  }

  const { loadType, tracks, playlistInfo } = result;

  if (loadType === 'playlist' && playlistInfo) {
    player.queue.addPlaylist(tracks, playlistInfo);
    message.channel.send(`📀 Playlist: **${playlistInfo.name}** with **${tracks.length}** tracks`);
    if (!player.playing && !player.paused) return player.play();
  } else if (loadType === 'search' || loadType === 'track') {
    const track = tracks.shift();
    track.info.requester = message.author;
    player.queue.add(track);
    message.channel.send(`🎵 Added: **${track.info.title}**`);
    if (!player.playing && !player.paused) return player.play();
  } else {
    return message.channel.send('❌ No results found.');
  }
});

// Forward raw voice events to TuneLink for voice connection support
client.on('raw', (packet) => {
  if (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE') {
    music.updateVoiceState(packet);
  }
});

client.login(DISCORD_TOKEN); 