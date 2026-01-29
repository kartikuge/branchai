# BranchAI v2 — Rebuild Documentation

## What is BranchAI?

A Chrome Extension that lets you fork ChatGPT conversations into a branching workspace backed by real LLM providers (Ollama, OpenAI, Anthropic). Previously called "StormAI v1", which used in-browser WebLLM (broken due to WebGPU requirements).

---

## Current State (Phase 1 Complete)

**Branch:** `v2_refactor`
**Status:** All Phase 1 files written, not yet committed.

### New files created (all untracked)

```
branchai/
  manifest.json                         # Unified MV3 manifest
  app/
    index.html                          # Main UI (3-pane layout)
    app.css                             # Styles + settings modal
    src/
      main.js                           # Entry point, provider orchestration
      state.js                          # State management, chrome.storage.local
      ui.js                             # DOM rendering (XSS-safe)
      utils.js                          # Helpers (copied from v1)
      providers/
        base.js                         # Abstract provider interface
        ollama.js                       # Ollama HTTP provider (streaming)
        registry.js                     # Provider factory + cache
  bg/
    background.js                       # Service worker (icon click + context handoff)
  content/
    content.js                          # ChatGPT page injector
    content.css                         # Branch button styling
  icons/
    icon16.png, icon48.png, icon128.png # Placeholder icons
```

### Old files (still present, untouched)

```
branch-host/          # Old web app (will be removed eventually)
branch-chat-ext/      # Old Chrome extension (replaced by new root-level structure)
```

### Bugs fixed in Phase 1

| Bug | Fix |
|-----|-----|
| Models don't run (WebLLM/WebGPU) | Replaced with HTTP-based Ollama provider |
| `newBranch({object})` call mismatch | Fixed to `newBranch(title, seedMessages)` positional args everywhere |
| XSS in transcript (`innerHTML`) | All content passed through `escapeHtml()` |
| `buildMessages()` caps at 12 msgs | Sends ALL branch messages now |
| localStorage only | `chrome.storage.local` with localStorage fallback |

---

## Remaining Phases

### Phase 2: Branching works correctly
- Verify "Branch from here" buttons on each message create a new branch with messages[0..idx]
- Verify "New Branch" sidebar button works
- Verify switching branches preserves each branch's messages independently
- Test that branched conversations continue independently

### Phase 3: Cloud providers (OpenAI + Anthropic)
- Create `app/src/providers/openai.js` — SSE streaming, Bearer auth
- Create `app/src/providers/anthropic.js` — SSE streaming, `x-api-key` + `anthropic-dangerous-direct-browser-access` headers, handle Anthropic message format (system as separate field, merge consecutive same-role messages)
- Register both in `registry.js`
- Add settings UI: API key inputs with test-connection buttons
- Add per-branch provider/model selector (different branches can use different models)

### Phase 4: Content script integration
- Test ChatGPT page → branch button → extension opens with scraped context
- Verify `chrome.storage.session` handoff from background.js to app page
- Verify late context injection (ctx-ready event)

### Phase 5: Export/import + hardening
- Rewrite `export_import.js` with correct state references (`currentProject().branches`, `state.activeProjectId`)
- Error handling: network errors, bad API keys, model not found, Ollama not running
- Token count display
- Empty state handling (no project, no branch, no messages)

---

## Key Architecture Decisions

- **API calls from extension page, not service worker:** MV3 service workers die after 30s idle. Extension pages stay alive. `host_permissions` bypasses CORS from extension pages.
- **No token limit in MVP:** Send all messages, let the API error if too long. Token windowing is a later enhancement.
- **Vanilla JS:** Codebase is ~800 lines total. No framework needed.
- **chrome.storage.local over localStorage:** Persists across tab closes, survives extension updates, higher storage limits.

---

## How to Test Phase 1

1. Open `chrome://extensions` → enable Developer mode
2. Click "Load unpacked" → select the `branchai/` root folder
3. Click the BranchAI extension icon → new tab opens
4. Should see: "Scratchpad" project, "Main" branch, Ollama connection status
5. If Ollama is running: model dropdown populated, type a message, click Run → get streaming response
6. If Ollama is NOT running: status shows error (not silent failure)
7. Test XSS: type `<script>alert(1)</script>` → renders as text
8. Close tab, reopen → state persisted

---

## Resume Point

**Start here tomorrow:** Phase 2 — verify branching logic works end-to-end, fix anything broken during manual testing of Phase 1. Then move to Phase 3 (cloud providers).
