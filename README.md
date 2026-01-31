# BranchAI

A Chrome Extension for forking AI conversations into branching workspaces. Branch from any message, explore alternate paths, and keep every thread organized — backed by real LLM providers.

## The Problem

AI conversations are linear. You get one shot at each response. Want to explore a different direction from message 5? Too bad — you'd have to start over, lose context, or manually copy-paste.

## The Solution

BranchAI lets you **fork any conversation at any point** into a new branch. Each branch is a full conversation with its own history, and you can switch between them freely. Think `git branch` for your AI chats.

### How it works

1. **Chat on ChatGPT** (or start fresh in the extension)
2. **Click "Branch"** on any message to fork the conversation from that point
3. **Continue each branch independently** with any LLM provider
4. **Organize branches into projects** with descriptions, emojis, and auto-generated summaries

## Features

- **Branch from any message** — fork conversations at any point, keeping full context up to that message
- **Multi-provider support** — Ollama (local), OpenAI, and Anthropic with streaming responses
- **Project organization** — group related branches into projects with grid and table views
- **Auto-summarization** — AI-generated one-line summaries for each branch, updated after every response
- **ChatGPT integration** — content script injects a branch button on ChatGPT, scrapes the transcript, and opens it in BranchAI
- **Per-branch provider/model** — each branch remembers which provider and model it was using
- **Export/Import** — save projects as JSON, share them, import them back
- **Dark/Light themes** — dark-first design with a light mode option

## Architecture

```
branchai/
  manifest.json              # Chrome MV3 manifest
  app/
    index.html               # 3-screen UI (Home / Project / Chat)
    app.css                  # Dark-first CSS with custom properties
    src/
      main.js                # Entry point, provider orchestration
      state.js               # State management (chrome.storage.local)
      ui.js                  # Screen-based DOM rendering
      router.js              # Minimal screen manager
      summarize.js           # Auto-summarization via provider.chat()
      icons.js               # Inline SVG icons
      utils.js               # Helpers (escapeHtml, timeAgo, etc.)
      export_import.js       # Project export/import
      providers/
        base.js              # Abstract provider interface
        registry.js           # Provider factory + cache
        ollama.js            # Ollama (local, streaming)
        openai.js            # OpenAI (streaming SSE)
        anthropic.js         # Anthropic (streaming SSE)
  bg/background.js           # Service worker
  content/
    content.js               # ChatGPT page injector
    content.css              # Branch button styling
```

Vanilla JS, no build step, no frameworks. ~2500 lines across 13 source files. State persisted via `chrome.storage.local` with `localStorage` fallback for development.

## Setup

1. Clone the repo
2. Open `chrome://extensions` with Developer Mode enabled
3. Click "Load unpacked" and select the repo root
4. Click the BranchAI icon in the toolbar

### Provider setup

- **Ollama** (default): Install [Ollama](https://ollama.com), run a model (`ollama run llama3.2`), connect at `http://localhost:11434`
- **OpenAI**: Add your API key in Settings
- **Anthropic**: Add your API key in Settings

## Development

No build required. Edit files and reload the extension. For development outside the extension context, open `app/index.html` directly in a browser — it falls back to `localStorage` and window globals.

## Status

Active development on the `v2_refactor` branch. See [V2_PLAN.md](./V2_PLAN.md) for detailed phase history and architecture decisions.
