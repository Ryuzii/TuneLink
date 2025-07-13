# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.8] - 2025-13-07
### Added
- Modular project structure (Player, Queue, Node, Track, etc.)
- Robust auto-resume (player state recovery after restart)
- Dynamic node failover and health checks
- Advanced queue and player management
- betterAutoPlay and improved autoPause/autoResume
- TypeScript definitions for all major classes
- Example bot with Discord.js v14+ and persistent player state
- Improved documentation and README
- Contributor credits (Ryuzii, SoulDevs)

### Changed / Fixed
- **Auto-resume event separation:** Added a new `autoResume` event to the Player and TuneLink classes. Now, when playback resumes after a node failover or reconnect, only the `autoResume` event is triggered (not `trackStart`). This allows bots to distinguish between normal track starts and auto-resume scenarios.
- **TypeScript definitions:** Updated `index.d.ts` to include documentation and overloads for the new `autoResume` event, improving IntelliSense and type safety for TypeScript users. 