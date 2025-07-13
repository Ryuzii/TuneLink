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

const lyricsIntervals = new Map();
const lastSearchSessions = new Map(); // Map<guildId, { userId, tracks, timeout }>

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
  defaultSource: 'spsearch',
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
music.on('autoResume', (player, track, payload) => {
  const channel = client.channels.cache.get(player.textChannel);
  if (channel) {
    channel.send(`🔄 Auto-resumed: **${track.info.title}** at ${Math.floor((payload.position || 0)/1000)}s`);
  }
  console.log(`[TuneLink] Auto-resumed ${track.info.title} in guild ${player.guildId} at position ${payload.position}ms`);
});

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

// Lyrics (with synced LRC support)
// music.on('trackStart', async (player, track) => {
//   // Clean up any previous interval for this guild
//   if (lyricsIntervals.has(player.guildId)) {
//     clearInterval(lyricsIntervals.get(player.guildId));
//     lyricsIntervals.delete(player.guildId);
//   }

//   const { title, author } = track.info;
//   const lyricsResult = await player.getLyrics({ track_name: title, artist_name: author });
//   const channel = client.channels.cache.get(player.textChannel);
//   if (!channel) return;

//   if (lyricsResult.error) {
//     channel.send(`❌ ${lyricsResult.error}`);
//   } else if (lyricsResult.syncedLyrics) {
//     let lastLine = '';
//     let lyricsMsg = await channel.send(`🎤 **${player.getCurrentLyricLine(lyricsResult.syncedLyrics, player.position)}**`);
//     const interval = setInterval(() => {
//       if (!player.playing || !player.current) return;
//       const currentLine = player.getCurrentLyricLine(lyricsResult.syncedLyrics, player.position);
//       if (currentLine && currentLine !== lastLine) {
//         lastLine = currentLine;
//         lyricsMsg.edit(`🎤 **${currentLine}**`).catch(() => {});
//       }
//     }, 1000);
//     lyricsIntervals.set(player.guildId, interval);

//     // Clean up on next track, queue end, or destroy
//     const cleanup = () => {
//       clearInterval(interval);
//       lyricsIntervals.delete(player.guildId);
//       player.off('trackStart', cleanup);
//       music.off('queueEnd', cleanup);
//       music.off('playerDestroy', cleanup);
//     };
//     player.once('trackStart', cleanup);
//     music.once('queueEnd', cleanup);
//     music.once('playerDestroy', cleanup);

//   } else if (lyricsResult.lyrics) {
//     channel.send({
//       embeds: [{
//         title: `Lyrics: ${lyricsResult.metadata.trackName} - ${lyricsResult.metadata.artistName}`,
//         description: lyricsResult.lyrics.length > 4000 ? lyricsResult.lyrics.slice(0, 4000) + '...' : lyricsResult.lyrics
//       }]
//     });
//   }
// });

// Helper to wait for player connection before playing
function waitForPlayerConnectionAndPlay(player) {
  if (player.connected) {
    player.play();
  } else {
    setTimeout(() => waitForPlayerConnectionAndPlay(player), 200);
  }
}

// Example: Play command (prefix !play)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.startsWith('!play ')) {
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
      if (!player.playing && !player.paused) return waitForPlayerConnectionAndPlay(player);
    } else if (loadType === 'search' || loadType === 'track') {
      const track = tracks.shift();
      track.info.requester = message.author;
      player.queue.add(track);
      message.channel.send(`🎵 Added: **${track.info.title}**`);
      if (!player.playing && !player.paused) return waitForPlayerConnectionAndPlay(player);
    } else {
      return message.channel.send('❌ No results found.');
    }
  }

  // Skip command
  if (message.content === '!skip') {
    const player = music.get(message.guildId);
    if (!player || !player.playing) return message.reply('Nothing is playing!');
    player.stop();
    return message.reply('⏭️ Skipped!');
  }

  // Stop command
  if (message.content === '!stop') {
    const player = music.get(message.guildId);
    if (!player) return message.reply('Nothing to stop!');
    player.destroy();
    return message.reply('⏹️ Stopped and left the voice channel.');
  }

  // Nowplaying (advanced)
  if (message.content === '!nowplaying' || message.content === '!np') {
    const player = music.get(message.guildId);
    if (!player || !player.current) return message.reply('Nothing is playing!');
    const info = player.current.info;
    const requester = info.requester ? `<@${info.requester.id}>` : 'Unknown';
    const duration = info.length ? `${Math.floor(info.length/60000)}:${String(Math.floor((info.length%60000)/1000)).padStart(2,'0')}` : 'Unknown';
    const position = player.position ? `${Math.floor(player.position/60000)}:${String(Math.floor((player.position%60000)/1000)).padStart(2,'0')}` : '0:00';
    return message.channel.send({
      embeds: [{
        title: `Now Playing: ${info.title}`,
        url: info.uri,
        description: `**Author:** ${info.author}\n**Duration:** ${position} / ${duration}\n**Requested by:** ${requester}`,
        thumbnail: info.artworkUrl ? { url: info.artworkUrl } : undefined
      }]
    });
  }

  // Queue (advanced)
  if (message.content.startsWith('!queue')) {
    const player = music.get(message.guildId);
    if (!player || !player.queue.length) return message.reply('The queue is empty!');
    const tracks = player.queue.slice(0, 10).map((track, i) => {
      const info = track.info;
      const requester = info.requester ? `<@${info.requester.id}>` : 'Unknown';
      return `\`${i+1}.\` **${info.title}** by *${info.author}* (requested by ${requester})`;
    }).join('\n');
    const stats = player.queue.getStats();
    return message.channel.send({
      embeds: [{
        title: 'Current Queue',
        description: tracks + (player.queue.length > 10 ? `\n...and ${player.queue.length-10} more` : ''),
        footer: { text: `Total: ${stats.totalTracks} tracks, ${Math.floor(stats.totalDuration/60000)} min` }
      }]
    });
  }

  // Lyrics (with synced LRC support)
  if (message.content === '!lyrics') {
    const player = music.get(message.guildId);
    if (!player || !player.current) return message.reply('Nothing is playing!');
    const { title, author } = player.current.info;
    const lyricsResult = await player.getLyrics({ track_name: title, artist_name: author });

    if (lyricsResult.error) {
      return message.reply(`❌ ${lyricsResult.error}`);
    } else if (lyricsResult.syncedLyrics) {
      // Clean up any previous interval for this guild
      if (lyricsIntervals.has(message.guildId)) {
        clearInterval(lyricsIntervals.get(message.guildId));
        lyricsIntervals.delete(message.guildId);
      }

      let lastLine = '';
      let lyricsMsg = await message.channel.send(`🎤 **${player.getCurrentLyricLine(lyricsResult.syncedLyrics, player.position)}**`);
      const interval = setInterval(() => {
        if (!player.playing || !player.current) return; // Don't update if not playing
        const currentLine = player.getCurrentLyricLine(lyricsResult.syncedLyrics, player.position);
        if (currentLine && currentLine !== lastLine) {
          lastLine = currentLine;
          lyricsMsg.edit(`🎤 **${currentLine}**`).catch(() => {});
        }
      }, 1000);

      // Store interval for this guild
      lyricsIntervals.set(message.guildId, interval);

      // Clean up on trackStart, queueEnd, or playerDestroy
      const cleanup = () => {
        clearInterval(interval);
        lyricsIntervals.delete(message.guildId);
        player.off('trackStart', cleanup);
        music.off('queueEnd', cleanup);
        music.off('playerDestroy', cleanup);
      };
      player.once('trackStart', cleanup); // new track
      music.once('queueEnd', cleanup);
      music.once('playerDestroy', cleanup);

    } else if (lyricsResult.lyrics) {
      // Plain lyrics fallback
      return message.channel.send({
        embeds: [{
          title: `Lyrics: ${lyricsResult.metadata.trackName} - ${lyricsResult.metadata.artistName}`,
          description: lyricsResult.lyrics.length > 4000 ? lyricsResult.lyrics.slice(0, 4000) + '...' : lyricsResult.lyrics
        }]
      });
    }
  }

  // Search command (interactive selection)
  if (message.content.startsWith('!search ')) {
    const query = message.content.slice('!search '.length).trim();
    if (!query) return message.reply('Please provide a search query!');
    let result;
    try {
      result = await music.resolve({ query, requester: message.author });
    } catch (err) {
      return message.reply(`❌ Search failed: ${err.message}`);
    }
    const { loadType, tracks } = result;
    if (!tracks || tracks.length === 0) {
      return message.reply('❌ No results found.');
    }
    // Store top 5 results for this guild and user
    const topTracks = tracks.slice(0, 5);
    const results = topTracks.map((track, i) => {
      const info = track.info;
      const duration = info.length ? `${Math.floor(info.length/60000)}:${String(Math.floor((info.length%60000)/1000)).padStart(2,'0')}` : 'Unknown';
      return `\`${i+1}.\` **${info.title}** by *${info.author}* [${duration}]`;
    }).join('\n');
    await message.channel.send({
      embeds: [{
        title: `Search results for: ${query}`,
        description: results + '\n\nType 1-5 to play a result, or type !cancel to cancel. (30s timeout)'
      }]
    });
    // Clean up any previous session for this guild
    if (lastSearchSessions.has(message.guildId)) {
      clearTimeout(lastSearchSessions.get(message.guildId).timeout);
      lastSearchSessions.delete(message.guildId);
    }
    // Set up session
    const timeout = setTimeout(() => {
      lastSearchSessions.delete(message.guildId);
      message.channel.send('⏳ Search timed out.');
    }, 30000);
    lastSearchSessions.set(message.guildId, { userId: message.author.id, tracks: topTracks, timeout });
    return;
  }

  // Interactive search selection: 1-5 or !cancel
  if (lastSearchSessions.has(message.guildId)) {
    const session = lastSearchSessions.get(message.guildId);
    if (message.author.id !== session.userId) return; // Only allow the user who searched
    if (/^[1-5]$/.test(message.content.trim())) {
      const index = parseInt(message.content.trim(), 10) - 1;
      const track = session.tracks[index];
      if (!track) return message.reply('Invalid track number.');
      // Clean up session
      clearTimeout(session.timeout);
      lastSearchSessions.delete(message.guildId);
      // Play the track
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
      track.info.requester = message.author;
      player.queue.add(track);
      message.channel.send(`🎵 Added: **${track.info.title}**`);
      if (!player.playing && !player.paused) return waitForPlayerConnectionAndPlay(player);
      return;
    }
    if (message.content.trim() === '!cancel') {
      clearTimeout(session.timeout);
      lastSearchSessions.delete(message.guildId);
      return message.reply('Search cancelled.');
    }
  }
});

client.on('raw', (packet) => {
  if (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE') {
    music.updateVoiceState(packet);
  }
});

client.login(DISCORD_TOKEN);