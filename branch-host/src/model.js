// Robust WebLLM loader + progress + CDN fallback

let engine = null;
let currentModel = null;

// try globals first (if index.html already loaded <script src=...webllm.min.js>)
function getGlobalWebLLM() {
  // eslint-disable-next-line no-undef
  return window?.webllm || null;
}

// inject a classic <script> tag and await it
function injectScriptOnce(src) {
  return new Promise((resolve, reject) => {
    // already present?
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = false;          // keep execution order
    el.onload = () => resolve();
    el.onerror = (e) => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

// ensure WebLLM global exists; try primary CDN then fallback
async function ensureWebLLM(onStatus) {
  if (getGlobalWebLLM()) return getGlobalWebLLM();

  // primary CDN
  const primary = "https://unpkg.com/@mlc-ai/web-llm@0.2.62/dist/webllm.min.js";
  try {
    onStatus?.("loading WebLLM runtime…", "warn");
    await injectScriptOnce(primary);
    if (getGlobalWebLLM()) return getGlobalWebLLM();
  } catch (_) {}

  // fallback CDN
  const fallback = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.62/dist/webllm.min.js";
  onStatus?.("CDN fallback for WebLLM…", "warn");
  await injectScriptOnce(fallback);
  const webllm = getGlobalWebLLM();
  if (!webllm) throw new Error("WebLLM runtime not available (both CDNs failed)");
  return webllm;
}

export function getCurrentModel() { return currentModel; }

function withProgress(onStatus) {
  return {
    onProgress: (prog) => {
      if (typeof prog?.progress === "number") {
        const pct = Math.round(prog.progress * 100);
        onStatus?.(`downloading ${pct}%${prog.text ? " – " + prog.text : ""}`, "warn");
      } else if (prog?.text) {
        onStatus?.(prog.text, "warn");
      }
    }
  };
}

async function tryInit(modelId, onStatus, baseURL, webllm) {
  currentModel = modelId;
  onStatus?.("loading model… (first time may take minutes)", "warn");
  // Create engine via web worker (keeps UI responsive)
  const engine = await webllm.CreateWebWorkerMLCEngine(
    new URL(baseURL),
    { model: modelId, ...withProgress(onStatus) }
  );
  onStatus?.(`ready: ${modelId}`, "ok");
  return engine;
}

export async function initModel(modelId, onStatus) {
  if (!('gpu' in navigator)) {
    onStatus?.('WebGPU not available (use recent Chrome/Edge)', 'bad');
    return null;
  }

  const webllm = await ensureWebLLM(onStatus);

  // primary → unpkg; fallback → jsDelivr
  try {
    engine = await tryInit(
      modelId,
      onStatus,
      "https://unpkg.com/@mlc-ai/web-llm@0.2.62/dist/",
      webllm
    );
  } catch (e) {
    onStatus?.("CDN fallback (jsDelivr)…", "warn");
    engine = await tryInit(
      modelId,
      onStatus,
      "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.62/dist/",
      webllm
    );
  }
  return engine;
}

export async function switchModel(modelId, onStatus) {
  try { engine?.unload?.(); } catch {}
  return initModel(modelId, onStatus);
}

export function sysPrompt(strategy) {
  if (strategy === 'critic')
    return "Critique the prior approach in ≤5 bullets, then output improved answer prefixed with 'Final:'. Be concise and technical.";
  if (strategy === 'plan')
    return "First output a numbered plan (3–7 steps), then execute it. Keep steps short and technical.";
  return "Continue this discussion from the provided context. Match tone and formatting. Be concise and technical.";
}

export async function run(messages, { temperature=0.7, max_tokens=1024, onToken } = {}) {
  if (!engine) throw new Error('Model not ready');
  let output = '';
  const webllm = getGlobalWebLLM();
  await engine.chat.completions.create(
    { stream: true, messages, temperature, max_tokens },
    { onToken: (t) => { output += t; onToken?.(output); } }
  );
  return output;
}
