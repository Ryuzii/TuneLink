# TuneLink

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=200&section=header&text=TuneLink&fontSize=80&fontAlignY=35&animation=twinkling&fontColor=gradient"/>
</p>

<p align="center">
  <b>High-performance, modular, and robust Lavalink client for Node.js.<br>Advanced player & queue, seamless auto-resume, dynamic node failover, and more.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tunelink"><img src="https://img.shields.io/npm/v/tunelink?style=for-the-badge&color=cb3837&logo=npm"/></a>
  <a href="https://github.com/Ryuzii/TuneLink"><img src="https://img.shields.io/github/package-json/v/Ryuzii/TuneLink?style=for-the-badge"/></a>
  <a href="https://github.com/Ryuzii/TuneLink/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Ryuzii/TuneLink.svg?style=for-the-badge"/></a>
  <a href="https://github.com/Ryuzii/TuneLink/graphs/contributors"><img src="https://img.shields.io/github/contributors/Ryuzii/TuneLink.svg?style=for-the-badge"/></a>
  <a href="https://github.com/Ryuzii/TuneLink/stargazers"><img src="https://img.shields.io/github/stars/Ryuzii/TuneLink.svg?style=for-the-badge"/></a>
  <a href="https://github.com/Ryuzii/TuneLink/issues"><img src="https://img.shields.io/github/issues/Ryuzii/TuneLink.svg?style=for-the-badge"/></a>
  <a href="https://discord.gg/xhTVzbS5NU"><img src="https://img.shields.io/discord/1056011738950156359?label=discord&logo=discord&style=for-the-badge&color=5865F2"/></a>
  <a href="https://ko-fi.com/enourdev" target="_blank"><img src="https://ko-fi.com/img/githubbutton_sm.svg"/></a>
</p>

---

# 📚 Table of Contents
- [Why TuneLink?](#why-tunelink)
- [Features](#main-features)
- [Supported Platforms](#supported-platforms)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Showcase](#showcase)
- [Requirements](#requirements)
- [Contributing](#contributing)
- [Support & Community](#support--community)
- [License](#license)

---

# 🤔 Why TuneLink?

> **Created and maintained by [Ryuzii](https://github.com/Ryuzii) — for developers who want total control, performance, and reliability in their Discord music bots.**

- No bloat, no legacy code, no global state. Just pure, modern, event-driven Lavalink client magic.
- Designed for advanced bots, but easy enough for beginners.
- Handles all the hard stuff: node failover, auto-resume, queue management, and more.
- **You want the best? You use TuneLink.**

---

# 📢 Main Features

- ⚡ **High Performance:** Minimal RAM/CPU usage, fast event-driven core.
- 🧩 **Modular:** Clean separation of player, queue, node, REST, and connection logic.
- 🎶 **Advanced Player & Queue:** Powerful queue, metadata, search, and playback control.
- 🔄 **Robust Auto-Resume:** Seamless player state recovery after restarts/disconnects.
- 🔀 **Dynamic Node Failover:** Automatic node selection and failover for reliability.
- 🎵 **Multi-Source Support:** YouTube, SoundCloud, Spotify, and more (via Lavalink plugins).
- 🛠️ **Easy API:** Simple, expressive API for rapid bot development.
- 🛡️ **Production Ready:** Handles edge cases, errors, and reconnections gracefully.

---

# 🎵 Supported Platforms

- <img src="https://img.shields.io/badge/YouTube-red?logo=youtube&logoColor=white"/> YouTube & YouTube Music
- <img src="https://img.shields.io/badge/SoundCloud-orange?logo=soundcloud&logoColor=white"/> SoundCloud
- <img src="https://img.shields.io/badge/Spotify-1DB954?logo=spotify&logoColor=white"/> Spotify *(LavaSrc)*
- <img src="https://img.shields.io/badge/Apple%20Music-black?logo=apple&logoColor=white"/> Apple Music *(LavaSrc)*
- <img src="https://img.shields.io/badge/Deezer-FF0000?logo=deezer&logoColor=white"/> Deezer *(LavaSrc)*
- And more!

---

# 📦 Installation

<p align="center">
  <a href="https://www.npmjs.com/package/tunelink"><img src="https://img.shields.io/npm/dt/tunelink?style=for-the-badge&color=cb3837&logo=npm"/></a>
</p>

```bash
npm install tunelink
```

---

# 🚀 Usage

## Full Example (Discord.js v14+)
```js
const { Client, GatewayIntentBits } = require('discord.js');
const { TuneLink } = require('tunelink');

const LAVALINK_NODES = [
  {
    host: 'lavalink.devxcode.in',
    port: 443,
    password: 'DevamOP',
    name: 'Local',
    secure: true
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
    if (guild) guild.shard.send(payload);
  },
  restVersion: 'v4',
  defaultSource: 'ytm',
  autoPause: { enabled: true },
  autoResume: { enabled: true, key: 'playerState.json' },
  betterAutoPlay: { enabled: true },
  dynamicNode: { enabled: true },
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  music.init(client.user.id);
});

// !play command
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('!play ')) return;

  const query = message.content.slice('!play '.length).trim();
  if (!query) return message.reply('Please provide a search query or URL!');

  const member = message.member;
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) return message.reply('You must be in a voice channel!');

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
    result = await music.resolve({ query, requester: message.author });
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

client.login(process.env.DISCORD_TOKEN);
```

---

# 🗂️ Project Structure

<details>
<summary><b>Click to expand core structure</b></summary>

| File            | Description                                      |
|-----------------|--------------------------------------------------|
| TuneLink.js     | Main orchestration, node/player management, API. |
| Player.js       | Playback, auto-resume, queue, VC logic.          |
| Queue.js        | Advanced queue management.                       |
| Track.js        | Track metadata, search, resolve.                 |
| Node.js         | Node management, failover, health.               |
| Connection.js   | WebSocket/voice connection logic.                |
| Rest.js         | Lavalink REST API wrapper.                       |
| Filters.js      | Audio filters (EQ, timescale, etc).              |
| Plugin.js       | Plugin system for extensions.                    |
</details>

---

# 🌟 Showcase

> **Are you using TuneLink in your bot?** Open a PR to get featured here!

| Bot Name | Invite Link | Support Server |
|----------|-------------|---------------|
| _YourBot_ | _Invite_   | _Server_      |

---

# 📌 Requirements
- Node.js **v18** or higher
- Lavalink server ([Guide](https://lavalink.dev/))
- Java **v18** or higher (for Lavalink)
- Discord Bot Token ([Guide](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot))

---

# 🤝 Contributing

Contributions are welcome! Please open issues or pull requests for bugs, features, or improvements.

---

# 👥 Contributors

<a href="https://github.com/Ryuzii/TuneLink/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=Ryuzii/TuneLink" />
</a>

- <b>[Ryuzii](https://github.com/Ryuzii)</b> (Author & Maintainer)
- <img src="https://avatars.githubusercontent.com/u/10298206?v=4" width="32" height="32" style="border-radius:50%;vertical-align:middle;"/> <b>[SoulDevs](https://github.com/SoulDevs)</b> (Contributor)

---

# 💬 Support & Community
- [GitHub Issues](https://github.com/Ryuzii/TuneLink/issues)
- [Discord Support Server](https://discord.gg/xhTVzbS5NU)

---

# 📝 License
This project is licensed under the [MIT License](https://github.com/Ryuzii/TuneLink/blob/main/LICENSE).

---

<p align="center">
  <b>Created and maintained by <a href="https://github.com/Ryuzii">Ryuzii</a>. All rights reserved.</b>
</p>
