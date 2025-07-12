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

## Basic Setup
```js
const { TuneLink } = require('tunelink');
const client = /* your Discord.js or Eris client */;

const nodes = [
  {
    name: 'MainNode',
    host: 'localhost',
    port: 2333,
    auth: 'youshallnotpass',
    secure: false,
  },
];

const tuneLink = new TuneLink(client, nodes, {
  send: (packet) => client.ws.send(packet),
  autoResume: { enabled: true, key: './playerState.json' },
  betterAutoPlay: true,
  dynamicNode: true,
  defaultSource: 'ytm',
});

tuneLink.init(client.user.id);
```

## Real-World Command Example
```js
// Play a track in a Discord command
const player = tuneLink.createConnection({
  guildId: interaction.guildId,
  textChannel: interaction.channelId,
  voiceChannel: userVoiceChannelId,
});
const result = await tuneLink.resolve({ query: 'never gonna give you up', requester: interaction.user });
if (result.loadType === 'track' && result.tracks.length) {
  player.queue.push(result.tracks[0]);
  player.play();
  interaction.reply('Now playing!');
} else {
  interaction.reply('No results found.');
}
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
- <b>[SoulDevs](https://github.com/SoulDevs)</b> (Contributor)

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
