# BranchAI v2 — Rebuild Documentation

## What is BranchAI?

A Chrome Extension that lets you fork ChatGPT conversations into a branching workspace backed by real LLM providers (Ollama, OpenAI, Anthropic). Previously called "StormAI v1", which used in-browser WebLLM (broken due to WebGPU requirements).

---

## Current State (Phase 6 Complete)

**Branch:** `v2_refactor`
**Status:** Phases 1–6 complete. The UI has been fully reworked from a 3-pane layout to a 3-screen navigation flow (Home → Project → Chat). Content script integration (Phase 4) still needs live testing on ChatGPT.

### File structure

```
branchai/
  manifest.json                         # Unified MV3 manifest
  app/
    index.html                          # Main UI (3-screen layout)
    app.css                             # Dark-first CSS with custom properties
    src/
      main.js                           # Entry point, provider orchestration, screen-based boot
      state.js                          # State management, chrome.storage.local, extended data model
      ui.js                             # Screen-based DOM rendering (XSS-safe)
      utils.js                          # Helpers (genId, escapeHtml, pickDefaultEmoji, timeAgo, etc.)
      router.js                         # Minimal screen-based view manager (NEW in Phase 6)
      icons.js                          # Inline SVG icon strings (NEW in Phase 6)
      export_import.js                  # Project export/import with extended fields
      providers/
        base.js                         # Abstract provider interface
        registry.js                     # Provider factory + cache
        ollama.js                       # Ollama HTTP provider (streaming)
        openai.js                       # OpenAI provider (streaming SSE)
        anthropic.js                    # Anthropic provider (streaming SSE)
  bg/
    background.js                       # Service worker (icon click + context handoff)
  content/
    content.js                          # ChatGPT page injector
    content.css                         # Branch button styling
  icons/
    icon16.png, icon48.png, icon128.png # Placeholder icons
  mockups/                              # UI reference mockups (untracked)
```

### Old files (still present, untouched)

```
branch-host/          # Old web app (will be removed eventually)
branch-chat-ext/      # Old Chrome extension (replaced by new root-level structure)
```

---

## Phase History

### Bugs fixed in Phase 1

| Bug | Fix |
|-----|-----|
| Models don't run (WebLLM/WebGPU) | Replaced with HTTP-based Ollama provider |
| `newBranch({object})` call mismatch | Fixed to `newBranch(title, seedMessages)` positional args everywhere |
| XSS in transcript (`innerHTML`) | All content passed through `escapeHtml()` |
| `buildMessages()` caps at 12 msgs | Sends ALL branch messages now |
| localStorage only | `chrome.storage.local` with localStorage fallback |

### Bugs fixed in Phase 2

| Bug | Fix |
|-----|-----|
| Ollama config key mismatch (`ollamaUrl` vs `url`) | `ollama.js` now reads `this.config.url` to match settings shape |
| Shared message refs between branches (shallow copy) | `newBranch()` and `newProject()` deep-copy with `.map(m => ({...m}))` |
| Stale output on branch switch | `renderAll()` clears `$('out')` on every render |

---

## Phase 3: Cloud providers (OpenAI + Anthropic) — DONE

### New files
| File | Description |
|------|-------------|
| `app/src/providers/openai.js` | OpenAI provider — `Bearer` auth, `GET /models` (filtered to `gpt-*`), `/chat/completions` streaming (SSE `data:` lines, `[DONE]` sentinel), uses `max_completion_tokens`, omits `temperature` by default to support reasoning models (o1/o3/o4) |
| `app/src/providers/anthropic.js` | Anthropic provider — `x-api-key` + `anthropic-version` + `anthropic-dangerous-direct-browser-access` headers, hardcoded model list (Sonnet 4, Haiku 3.5, Opus 3, 3.5 Sonnet, 3 Haiku), `_prepareMessages()` extracts system → top-level `system` field + merges consecutive same-role messages, SSE via `event: content_block_delta` / `event: message_stop`, `testConnection()` sends minimal 1-token request |

### Modified files
| File | Change |
|------|--------|
| `app/src/providers/registry.js` | Imported + registered `OpenAIProvider` and `AnthropicProvider` in `providerClasses` |
| `app/src/ui.js` | Added `getProvider` import; settings modal inputs wrapped in `.setting-row` with "Test" button + result `<span>` per provider; `_testProvider()` helper; `onBranchSwitch` callback called at end of `renderAll()` |
| `app/src/main.js` | `populateModels()` accepts optional `selectModelId`; new `syncBranchProvider()` restores branch provider/model on switch; `sendMessage()` uses branch `provider`/`model` with fallback to global; `onProviderChange`/`onModelChange` save to current branch; removed hardcoded `temperature: 0.7` from `sendMessage()` |
| `app/app.css` | Added `.setting-row`, `.btn-sm`, `.test-result`, `.test-ok`, `.test-fail` styles |

### Bugs fixed during Phase 3
| Bug | Fix |
|-----|-----|
| OpenAI rejects `max_tokens` on newer models | Changed to `max_completion_tokens` |
| OpenAI reasoning models (o1/o3/o4) reject custom `temperature` | Temperature only sent when explicitly provided by caller; removed hardcoded `0.7` from `sendMessage()` |

---

## Phase 4: Content script integration — NEEDS TESTING

- Test ChatGPT page → branch button → extension opens with scraped context
- Verify `chrome.storage.session` handoff from background.js to app page
- Verify late context injection (ctx-ready event)

---

## Phase 5: Export/import + hardening — DONE

### New files
| File | Description |
|------|-------------|
| `app/src/export_import.js` | `exportCurrentProject()` serializes active project to JSON Blob and triggers download as `{name}.branchai.json`. `importFromFile(file)` reads JSON via FileReader, validates shape (`name` + `branches`), assigns fresh IDs via `genId()` to avoid collisions, pushes into state, sets as active, persists. |

### Modified files
| File | Change |
|------|--------|
| `app/src/main.js` | `onImport` handler now calls `renderAll()` after successful import, with try/catch showing errors inline in output pane. Added `setCurrentModelId` import + calls wherever `currentModelId` changes (populateModels, syncBranchProvider, onModelChange). |
| `app/src/providers/ollama.js` | `listModels()`, `chat()`, `chatStream()` wrap `fetch` in try/catch — network failures throw `"Ollama not running at {url}"`. HTTP 404 → `"Model not found"`. |
| `app/src/providers/openai.js` | Same try/catch pattern in `listModels()`, `chat()`, `chatStream()` — network failures throw `"Cannot reach OpenAI API"`. 401 → `"Invalid OpenAI API key"` / `"Invalid API key"`, 429 → `"Rate limited — try again shortly"`, 404 → `"Model not found"`. |
| `app/src/providers/anthropic.js` | `chat()` and `chatStream()` wrap fetch in try/catch — network errors → `"Cannot reach Anthropic API"`, 401 → `"Invalid Anthropic API key"`, 429 → `"Rate limited — try again shortly"`, 400 → parsed error detail from response body. |
| `app/src/utils.js` | Added `TOKEN_LIMITS` map (`claude-` → 200k, `gpt-4` → 128k, `gpt-3.5` → 16385, default 8192) and exported `getTokenLimit(modelId)`. |
| `app/src/ui.js` | Added `_currentModelId` state + `setCurrentModelId()` export. `updateTokenInfo()` now shows `~{tokens} / {limit} tokens` with color classes: `token-ok` (<50%), `token-warn` (50–80%), `token-danger` (>80%). `renderBranches()` shows `"No branches yet"` when empty. `renderAll()` shows `"Connect a provider in Settings"` hint when modelSel is `--`. |
| `app/app.css` | Added `.token-ok` (green), `.token-warn` (amber), `.token-danger` (red) classes. |

---

## Phase 6: UI/UX Rework — DONE

### Goal

Replaced the cramped 3-pane layout with a 3-screen navigation flow matching the mockups:
1. **Home** — Project cards (grid/list)
2. **Project** — Branch cards within a project (grid/list)
3. **Chat** — Full-width chat view with streaming responses

### Reference Mockups

See `mockups/` folder:
- `10.10.40` — Home screen, grid view (project cards with gradients, emojis, branch count, time ago)
- `10.10.49` — Home screen, list view (full-width rows)
- `10.11.03` — Project detail / branches screen (branch cards with message count, time ago, branched-from indicator)
- `10.12.03` — Chat view (breadcrumb nav, purple user bubbles, AI bubbles, input bar at bottom)

---

### Sub-phase 6.1: State Model + Utils — DONE

**Files modified:** `app/src/state.js`, `app/src/utils.js`, `app/src/export_import.js`

#### state.js changes
- **Project** — added `description` (string), `emoji` (string), `updatedAt` (timestamp)
- **Branch** — added `description` (string), `emoji` (string), `updatedAt` (timestamp), `branchedFromMsg` (number|null)
- **State** — added `viewMode: 'grid'|'list'`, default `darkMode: true` (dark-first)
- `newProject(name, seedMessages, firstBranchTitle, { description, emoji })` — accepts options object as 4th param; sets `updatedAt`, assigns emoji via `pickDefaultEmoji()` if not provided
- `newBranch(title, seedMessages, branchedFromMsg, { description, emoji })` — accepts `branchedFromMsg` as 3rd param and options as 4th; sets `updatedAt`, also updates parent project's `updatedAt`
- `normalizeState()` — backfills `description`, `emoji`, `updatedAt`, `branchedFromMsg` on all projects/branches for backward compatibility with old saved state

#### utils.js changes
- Added `pickDefaultEmoji()` — rotates through 8 emojis (rocket, bulb, palette, lightning, chart, wrench, star, memo)
- Added `timeAgo(ts)` — returns human-readable strings: "just now", "5m ago", "2h ago", "3d ago", "1mo ago"

#### export_import.js changes
- Export now includes `description`, `emoji`, `updatedAt`, `branchedFromMsg` for projects and branches
- Import defaults missing fields (`description: ''`, `emoji` via `pickDefaultEmoji()`, `updatedAt` from `createdAt` or `now()`, `branchedFromMsg: null`)

---

### Sub-phase 6.2: Router — DONE

**New file:** `app/src/router.js` (24 lines)

- `SCREENS = { HOME: 'home', PROJECT: 'project', CHAT: 'chat' }`
- `navigateTo(screen)` — sets current screen, skips if already there, fires registered callbacks
- `onScreenChange(cb)` — register listener
- `getCurrentScreen()` — getter
- Initial screen is `HOME`

---

### Sub-phase 6.3: HTML Restructure — DONE

**File rewritten:** `app/index.html`

Replaced the 3-column `<div class="wrap">` grid with:
```html
<html class="dark">
<header id="appHeader">                   <!-- dynamic content per screen -->
<main id="screen-home" class="screen active">
  <div class="screen-inner">
    <div id="home-content"></div>
  </div>
</main>
<main id="screen-project" class="screen">
  <div class="screen-inner">
    <div id="project-content"></div>
  </div>
</main>
<main id="screen-chat" class="screen">
  <div class="chat-container">
    <div class="chat-subtitle" id="chatSubtitle"></div>
    <div class="chat-messages" id="chatMessages"></div>
    <div class="chat-input-bar">
      <textarea id="chatInput" ...></textarea>
      <button class="send-btn" id="sendBtn"></button>
    </div>
  </div>
</main>
<input type="file" id="fileInput" hidden>
```

Removed elements: `.wrap`, `.pane`, `#leftPane`, `#transcript`, `#extra`, `#out`, `#runBtn`, `#copyBtn`, `#importBtn`, `#exportBtn`, `#darkModeToggle`, `#providerSel`/`#modelSel` (now rendered dynamically in header), `#projectName`, `#tokenInfo` (now in header), `#newProjectBtn`/`#newBranchBtn` (now in header).

---

### Sub-phase 6.4: CSS Rewrite — DONE

**File rewritten:** `app/app.css` (~800 lines)

Dark-first design with CSS custom properties:

| Section | Details |
|---------|---------|
| Custom properties (`:root`) | `--bg: #0a0a0f`, `--surface: #14141f`, `--accent: #7c3aed` (purple), `--text: #e8e8ed`, `--border: #222235`, etc. |
| Light theme (`html.light`) | `--bg: #f8f9fb`, `--surface: #ffffff`, `--accent: #7c3aed`, light card gradients |
| Header | Sticky, `.header-left` (logo/breadcrumb), `.header-right` (actions, margin-left: auto) |
| Breadcrumb | `.breadcrumb` with links, separator chevrons, `.current` bold |
| View toggle | `.view-toggle` button group, `.active` state |
| Header selects | `.header-select` with styled `<select>` for provider/model |
| Status pill | `.status-pill` with `.status-ok` / `.status-bad` / `.status-connecting` |
| Screen system | `.screen` hidden, `.screen.active` visible, `.screen-inner` max-width 1100px |
| Page titles | `.page-title` 28px bold, `.page-subtitle` 15px muted |
| Cards (grid) | `.cards-grid` responsive grid (minmax 300px), `.project-card` / `.branch-card` with gradient backgrounds |
| Card gradients | 4 variants by `:nth-child(4n+N)`: purple-dark, teal-dark, green-dark, rose-dark |
| Card elements | `.card-emoji` 28px, `.card-name` 18px bold, `.card-desc`, `.card-meta` with icon+text spans |
| Active dot | `.active-dot` green circle on active branch card |
| Card delete | `.card-delete` absolute positioned, opacity 0 → 1 on hover |
| Cards (list) | `.cards-list` flex column, `.list-row` with emoji, body, meta, delete button |
| Chat layout | `.chat-container` flex column full height, max-width 840px |
| Chat subtitle | `.chat-subtitle` with branched-from info and message count |
| Message bubbles | `.msg-row.user` right-aligned purple, `.msg-row.assistant` left-aligned dark surface |
| Message avatars | `.msg-avatar` 32px circles, purple for user, surface-alt for AI |
| Message actions | `.msg-actions` absolute positioned, opacity 0 → 1 on hover, `.msg-action-btn` pill buttons |
| Streaming cursor | `.streaming-cursor::after` blinking dot animation |
| Chat input bar | `.chat-input-bar` fixed bottom, auto-resize textarea, `.send-btn` round purple 44px |
| Settings modal | `.modal-overlay` / `.modal` with updated dark styling |
| Dark mode toggle | `.dark-mode-row` with `.toggle-switch` slider in settings modal |
| Create modals | `.create-form` with text input, textarea, `.emoji-grid` with `.emoji-option` selectable tiles |
| Scrollbar | Thin 6px custom scrollbar matching theme |

---

### Sub-phase 6.5: UI Rewrite + Icons — DONE

**New file:** `app/src/icons.js`
- Exports `ICONS` object with inline SVG strings for: `gitBranch`, `gitFork`, `clock`, `message`, `grid`, `list`, `plus`, `arrowUp`, `backArrow`, `chevronRight`, `gear`, `copy`

**File rewritten:** `app/src/ui.js` (~640 lines)

#### Architecture change
- Old: `bindStaticControls()` + `renderProjects()` / `renderBranches()` / `renderTranscript()` for 3 panes
- New: `setCallbacks()` + `renderAll()` dispatches to screen-specific renderers; header rendered dynamically per screen

#### Header rendering (`renderHeader()`)
- **HOME**: "BranchAI" logo + grid/list toggle + settings gear + "+ New Project" button
- **PROJECT**: Back arrow + "Projects" link + chevron + `[emoji] Project Name` + grid/list toggle + settings gear + "+ New Branch" button
- **CHAT**: Back arrow + "Projects" link + chevron + project link + chevron + `[emoji] Branch Name` + provider select + model select + status pill + token badge + settings gear

#### `wireHeaderEvents()`
Called after each header render. Binds: logo click → HOME, nav links → HOME/PROJECT, view toggle → update `state.viewMode` + re-render, settings button → open modal, new project/branch buttons → open create modals, provider/model selects → callbacks to main.js

#### `renderProjectsScreen()`
- Title "Your Projects" + subtitle
- Grid mode: `.cards-grid` with `.project-card` (emoji, name, description, branch count, time ago, delete button)
- List mode: `.cards-list` with `.list-row` (emoji, name, description, meta, delete)
- Click card → set `activeProjectId`, navigate to PROJECT
- Delete button → confirm dialog → `deleteProject()`

#### `renderBranchesScreen()`
- Title "Branches" + project description subtitle
- Grid/list cards with: emoji, title, description, message count, time ago, branched-from indicator, active green dot
- Click → set `activeBranchId`, navigate to CHAT
- Delete button → confirm → `deleteBranch()`

#### `renderChatScreen()`
- Subtitle bar: "Branched from msg N · M messages"
- Message bubbles: `.msg-row.user` (purple, right, "You" avatar) / `.msg-row.assistant` (dark, left, "AI" avatar)
- Hover actions per message: "Branch" button (creates branch with `branchedFromMsg`) + "Copy" button (assistant only, clipboard)
- Auto-scrolls to bottom after render
- Updates token info badge
- Sets send button SVG icon

#### Streaming
- `appendStreamingBubble()` — adds new assistant `.msg-row` with `#streaming-content` bubble + `.streaming-cursor` class
- `updateStreamingContent(text)` — updates textContent + auto-scrolls

#### `openSettingsModal()`
- Dark mode toggle (checkbox with slider switch)
- Ollama URL, OpenAI key, Anthropic key inputs with Test buttons
- Export Project / Import Project buttons in footer
- Save button
- `_testProvider()` helper validates connections with visual feedback

#### `openNewProjectModal()` / `openNewBranchModal()`
- Modal with: name input, description textarea, emoji picker (8 options grid)
- Enter key submits
- On save: calls callback with (name, description, emoji), navigates to next screen

#### Exports
`setCurrentModelId`, `setCallbacks`, `renderAll`, `setModelStatus`, `appendStreamingBubble`, `updateStreamingContent`, `openSettingsModal`, `getSettingsValues`

---

### Sub-phase 6.6: Main.js Updates — DONE

**File rewritten:** `app/src/main.js` (~390 lines)

#### `sendMessage()`
- Reads from `$('chatInput')` instead of old `$('extra')`
- Clears input + auto-resizes textarea after read
- Pushes user message → persist → `renderAll()` (shows bubble immediately)
- Calls `appendStreamingBubble()` before streaming starts
- `onToken` callback → `updateStreamingContent(text)` (real-time bubble update)
- On complete: reads `#streaming-content` textContent, pushes assistant message, updates `b.updatedAt` + `p.updatedAt`, persists, full re-render
- Error: updates streaming bubble with error text, sets status to bad
- Disables send button during generation

#### Callback system (`setCallbacks`)
Replaced old `bindStaticControls()` with `setCallbacks()`:
- `onProviderChange` — activates provider, saves to branch
- `onModelChange` — updates `currentModelId`, saves to branch and global default
- `onSettingsSave` — reads settings form, updates state, re-activates provider
- `onDarkModeChange` — updates `darkMode` setting, calls `applyTheme()`
- `onExport` — lazy-imports `export_import.js`, calls `exportCurrentProject()`

#### Provider/model management
- `populateProviders()` / `populateModels()` — null-check `$('providerSel')` / `$('modelSel')` since they only exist on CHAT screen
- `_cachedModels` array — models fetched once on `activateProvider()`, reused via `repopulateModelsFromCache()` when re-entering CHAT screen (avoids redundant API calls)
- `syncBranchProvider()` — restores branch's saved provider/model into header dropdowns on CHAT entry

#### Screen change listener (`onScreenChange`)
- On navigate to CHAT: `populateProviders()` → `repopulateModelsFromCache()` → `syncBranchProvider()` → `wireChatInput()`
- Always calls `renderAll()` on any screen change

#### Chat input wiring (`wireChatInput()`)
- Enter → send (Shift+Enter → newline)
- `oninput` → `autoResizeTextarea()` (height auto-adjusts up to 150px max)
- Send button click → `sendMessage()`
- Re-wired on each CHAT screen entry (since DOM is rebuilt)

#### Boot sequence
1. `getInjectedContext()` — checks `chrome.storage.session`, window globals, sessionStorage (unchanged)
2. `loadInitial()` with injected context
3. `applyTheme()` — toggles `html.dark` / `html.light` classes
4. `activateProvider()` eagerly (caches models internally for later)
5. If injected context → `navigateTo(CHAT)` (fires `onScreenChange` → render + wire)
6. Else → `renderAll()` manually (HOME is default, `navigateTo` skips since already HOME)
7. Late context listeners: `branchai:ctx-ready` event + `CTX_READY` message from background

#### Dark mode
- No more standalone toggle button in header
- Moved to settings modal as toggle switch checkbox
- `applyTheme()` sets both `dark` and `light` classes on `<html>` for CSS specificity

---

### Sub-phase 6.7: Feature Preservation — VERIFIED

All features from the old 3-pane UI preserved in the new screen-based UI:

| Feature | Old Location | New Location | Status |
|---------|-------------|-------------|--------|
| Export project | Header button `#exportBtn` | Settings modal footer "Export Project" button → `onExport` callback | Done |
| Import project | Header button `#importBtn` + `#fileInput` | Settings modal footer "Import Project" button → triggers `#fileInput` | Done |
| Copy message | `#copyBtn` (copied latest output) | Hover action on each assistant bubble → `navigator.clipboard.writeText()` per message | Done |
| Token info | `#tokenInfo` badge in mid-pane toolbar | `#tokenInfo` badge in chat screen header, with ok/warn/danger colors | Done |
| Content script injection | `getInjectedContext()` → `loadInitial()` | Unchanged logic, now navigates to CHAT screen on context received | Done |
| Branch from message | "branch here" button per transcript message | "Branch" hover button per chat bubble, creates branch with `branchedFromMsg` index | Done |
| Delete project | `×` button on project list item | `×` hover button on project card/row with confirm dialog | Done |
| Delete branch | `×` button on branch list item | `×` hover button on branch card/row with confirm dialog | Done |
| Dark/light mode | `#darkModeToggle` button in header | Toggle switch in settings modal, `onDarkModeChange` callback | Done |
| Per-branch provider/model | Saved on branch object, restored via `syncBranchProvider()` | Same logic, `syncBranchProvider()` called on CHAT screen entry | Done |
| Settings modal | `#settingsBtn` in header → modal | `#settingsBtn` (gear icon) in header on all screens → same modal with updated styling | Done |
| Streaming responses | `onToken` → `$('out').textContent` | `appendStreamingBubble()` + `updateStreamingContent()` → chat bubble with blinking cursor | Done |
| Auto-scroll | `#transcript` scrollTop on render | `#chatMessages` scrollTop on render + on each streaming token | Done |

---

## Key Architecture Decisions

- **API calls from extension page, not service worker:** MV3 service workers die after 30s idle. Extension pages stay alive. `host_permissions` bypasses CORS from extension pages.
- **No token limit in MVP:** Send all messages, let the API error if too long. Token windowing is a later enhancement.
- **Vanilla JS:** Codebase is ~2000 lines total across 10 source files. No framework needed.
- **chrome.storage.local over localStorage:** Persists across tab closes, survives extension updates, higher storage limits.
- **Screen-based navigation over 3-pane layout:** Each screen gets full viewport width. Header content changes per screen. Router is ~25 lines with callback pattern.
- **Callback pattern over direct imports:** `ui.js` doesn't import from `main.js`. Instead, `main.js` registers callbacks via `setCallbacks()` that `ui.js` invokes on user actions. Avoids circular dependencies.
- **Cached model lists:** Provider models fetched once on `activateProvider()`, stored in `_cachedModels`. Re-entering CHAT screen repopulates selects from cache via `repopulateModelsFromCache()` without re-fetching.

---

## How to Test (Full)

1. Load extension in `chrome://extensions` (Developer mode), click icon
2. **Home screen**: see project cards in grid view, toggle to list view, create new project with name/description/emoji picker
3. **Click project**: see branches screen with breadcrumb nav, branch cards with metadata (message count, time ago, branched-from indicator)
4. **Click branch**: see chat view with message bubbles, type message, get streaming response in purple/dark bubbles
5. **Branch from message**: hover any message → click "Branch" → navigates to project screen → new branch with correct `branchedFromMsg`
6. **Copy message**: hover assistant message → click "Copy" → text copied to clipboard
7. **Persistence**: close tab, reopen → state restored, projects/branches intact
8. **Settings**: gear icon → modal with dark mode toggle, provider configs, test buttons, export/import
9. **Export/Import**: export project from settings → JSON file downloaded; import → new project appears
10. **Content script**: open ChatGPT, click branch button on a message → extension opens at chat screen with scraped context

---

## Post-Phase 6: UI Refinements — DONE

### Tabular list view

Replaced the old `.cards-list` / `.list-row` list mode with a proper data table layout for both screens:

- **Projects table** — columns: PROJECT, DESCRIPTION, BRANCHES, UPDATED
- **Branches table** — columns: BRANCH, SUMMARY, MESSAGES, ORIGIN, UPDATED

CSS uses `.data-table` container with `.table-header` / `.table-row` using `display: grid`. Column widths set per table type (`.projects-table` 4-col, `.branches-table` 5-col). Active branch gets a green left border (`.row-active`). Delete button appears on row hover.

Grid view (cards) is unchanged and still available via the toggle.

### Bug fixes

| Bug | Fix |
|-----|-----|
| Theme toggle did nothing | `ui.js` called `_callbacks.onThemeToggle()` but main.js registered `onDarkModeChange` — fixed callback name |
| Sun/moon icon didn't update after toggle | Added `renderAll()` call after `applyTheme()` in `onDarkModeChange` |
| Model dropdown stuck on "loading..." | Redundant `renderAll()` after `navigateTo()` destroyed populated selects — removed 5 redundant calls in ui.js |
| Status pill reset to "starting..." on re-render | Added `replayModelStatus()` after `renderChatScreen()` in `renderAll()` |
| Breadcrumb chevron SVG unsized | Added `display: flex` and `svg { width: 14px }` to `.breadcrumb .sep` |
| Message action button SVGs unsized | Added `.msg-action-btn svg { width: 12px; height: 12px }` |
| Chat selects empty after theme toggle | Added select repopulation (`populateProviders` + `repopulateModelsFromCache` + `wireChatInput`) to `onDarkModeChange` when on chat screen |

---

## Planned: Auto-Summarization for Branches

### Goal

Auto-generate concise one-line summaries for branches that populate the "Summary" column in the branches table. The summary is derived from the branch's conversation messages and branch-point context.

### Data model changes (`state.js`)

Add two fields to each branch object (backfilled via `normalizeState`):

| Field | Type | Purpose |
|-------|------|---------|
| `b.summary` | `string` | AI-generated summary, separate from user-editable `b.description` |
| `b.summaryMsgCount` | `number` | Message count when summary was last generated; used to skip re-summarization of unchanged branches |

`normalizeState()` backfills: `if (!b.summary) b.summary = '';` and `if (b.summaryMsgCount == null) b.summaryMsgCount = 0;`

### New module: `app/src/summarize.js`

Single exported function:

```js
export async function summarizeBranch(provider, model, branch) → Promise<string>
```

**Logic:**
1. If branch has 0 messages, return `''`
2. Take up to the first ~20 messages to keep token usage low
3. Build a prompt:
   - System: `"Summarize this conversation in one concise sentence (under 80 chars). Return ONLY the summary, no quotes."`
   - Include truncated messages as context (role + content pairs)
   - If `branch.branchedFromMsg != null`, prepend context: `"This conversation was branched from message N of a parent thread."`
4. Call `provider.chat(messages, { model, max_tokens: 60, temperature: 0.3 })` — uses the non-streaming `chat()` method
5. Return the trimmed result; on error, return `''`

### Trigger points

**Primary — after chat send** (`main.js`, inside `sendMessage()` after assistant response is saved):

```js
// Fire-and-forget, non-blocking
if (b.messages.length !== b.summaryMsgCount) {
  summarizeBranch(provider, model, b).then(summary => {
    if (summary) {
      b.summary = summary;
      b.summaryMsgCount = b.messages.length;
      persist();
    }
  });
}
```

This runs in the background after each LLM response without blocking the UI or the main chat flow.

**Secondary — lazy fill on PROJECT screen entry** (`main.js`, inside `onScreenChange` for PROJECT screen):

For each branch where `b.messages.length > 0 && b.summaryMsgCount !== b.messages.length`, queue a background summarization call. This handles imported branches and data that existed before the feature was added.

### Display (`ui.js`)

Update the branches table `col-desc` cell to prefer summary over description:

```js
const summaryText = b.summary || b.description || '';
```

### Export/import (`export_import.js`)

Include `summary` and `summaryMsgCount` in export. On import, default to `''` / `0` if missing.

### Cost / performance notes

- Uses `chat()` (non-streaming) — one short API call per summarization, no streaming overhead
- Max 60 output tokens keeps cost minimal (~$0.001 or less per call)
- `summaryMsgCount` guard prevents re-summarizing unchanged branches
- Fire-and-forget pattern ensures UI is never blocked by summarization
- Only first ~20 messages sent as context to avoid large token input costs
- Lazy fill on PROJECT screen batches existing branches but could be rate-limited if needed

### Implementation order

1. `state.js` — add `summary` / `summaryMsgCount` to `normalizeState()`
2. New `app/src/summarize.js` — the summarization function
3. `main.js` — hook after `sendMessage()` completion + lazy fill on PROJECT screen entry
4. `ui.js` — display `b.summary || b.description` in the Summary column
5. `export_import.js` — include new fields in export/import

---

## Resume Point

**All phases complete. Tabular list view and bug fixes done.** Next steps:
- Implement auto-summarization feature (see plan above)
- Live-test content script integration on ChatGPT (Phase 4 verification)
- Polish: empty state illustrations, loading skeletons, keyboard shortcuts
- Remove legacy `branch-host/` and `branch-chat-ext/` directories
- Real extension icons (replace placeholders)
