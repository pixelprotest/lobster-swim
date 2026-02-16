# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lobster Swim is a browser-based arcade survival game built with vanilla JavaScript (ES6 modules) and HTML5 Canvas. No build tools, no frameworks — static files served from `src/`.

## Development

Run `make dev` from the project root. This builds and starts a Docker container running Vite with hot module reloading. The game is served at `http://localhost:5177`. Edit files in `src/` and the browser updates automatically.

Requires Docker — no Node or other dependencies needed on the host machine. Dev config lives in `dev/` (Dockerfile, docker-compose.yml, vite.config.js, package.json).

**Python tooling** lives in `dev/` managed by [uv](https://docs.astral.sh/uv/). Run `make sprites` to strip baked-in backgrounds from sprite PNGs using `rembg`. Requires `uv` on the host (`curl -LsSf https://astral.sh/uv/install.sh | sh`). The virtual environment (`dev/.venv/`) is gitignored.

**Testing is manual:** check the browser console for errors and verify the changed feature works. A dev panel is available by clicking the version number in the footer (exposes level skip, score manipulation, god mode, etc.).

**Version bumping** — update version string in `src/index.html`, `src/pages/*.html`, and `src/js/components/BottomNav.js`. Cache-bust query params (`?v=XXXX`) on script/CSS tags in HTML files.

## Architecture

### Entry Point
`src/index.html` loads `src/js/app.js` (the main game loop, ~980 lines). **Not** `main.js` or `game.js` — those are unused legacy files.

### Entity Pattern (critical)
Every game object lives in a per-entity folder with this structure:

```
src/js/entities/<category>/<entity-name>/
├── actor/<Name>.js       # Game class — owns state, physics, collision detection
├── render/<Name>.vXXX.js # Versioned renderer — pure render(ctx, x, y, ...params), no state
└── preview.js            # Asset library manifest — auto-discovered via import.meta.glob
```

Multiple renderer versions can coexist in `render/`; the actor imports whichever is marked `@current true`.

Categories: `hero/`, `enemies/`, `pickups/`, `effects/`, `mechanics/`, `environments/`

Shared utilities (color conversion, presets) live in `src/js/entities/utils/`.

### Adding/Modifying Entities
When creating a new entity or version, you **must** create a `preview.js` in the entity folder — this is how the asset library auto-discovers it. No manual HTML wiring needed. See PRACTICES.md for the full checklist.

### Web Components
`src/js/components/` contains Shadow DOM web components (BottomNav, TitleScreen, GameOver, Leaderboard). Custom events must use `bubbles: true, composed: true` to escape shadow DOM.

### Audio
`src/js/audio-module.js` — music via HTML5 `<audio>` (per-level MP3 tracks in `src/assets/music/`), sound effects via Web Audio API oscillators (procedural, no audio files).

### Game Levels
Three levels triggered by score thresholds: Ocean (0+), Seafood Tank (200+), Kitchen (500+). Difficulty scales enemy speed/count at score milestones (100/200/500/1000).

### Data
High scores persist in localStorage. Leaderboard uses a session-based API (`/api/scores`) with anti-cheat validation.

## Code Quality Rules

Follow the rules in PRACTICES.md. The key principles:

- **DRY** — game classes import versioned renderers; never duplicate drawing code. Extract shared logic to `entities/utils/`.
- **Encapsulation** — entities own their behavior. Pass parameters in, don't reach out for config.
- **Single source of truth** — versioned renderers are the canonical visual definition. The asset library imports the same renderers as the game.
- **Pre-dev reality check** — run `git log --oneline -5` before starting work. Don't trust cached context about the current state.
