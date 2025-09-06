// Robust WebLLM loader: tries unpkg -> jsDelivr (fastly) -> jsDelivr (gcore)
// Shows download progress; works even if one CDN is blocked.

let engine = null;
let currentModel = null;

const CDNS = [
  // runtime
  "https://unpkg.com/@mlc-ai/web-llm@0.2.62/dist/webllm.min.js",
  "https://fastly.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.62/dist/webllm.min.js",
  "https://gcore.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.62/dist/webllm.min.js",
];

// base URLs for models/worker (same order as runtime CDNs)
const BASES = [
  "https://unpkg.com/@mlc-ai/web-llm@0.2.62/dist/",
  "https://fastly.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.62/dist/",
  "https://gcore.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.62/dist/",
];

function setStatus(onStatus, text, level) { onStatus && onStatus(text, level); }

function haveWebLLM() { return typeof window.webllm === "object"; }

function inject(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src === src)) return res();
    const s = document.createElement("script");
    s.src = src; s.async = false;
    s.onload = () => res();
    s.onerror = () => rej(new Error(`failed ${src}`));
    document.head.appendChild(s);
  });
}

export function getCurrentModel() { return currentModel; }

export async function initModel(modelId, onStatus) {
  if (!("gpu" in navigator)) {
    setStatus(onStatus, "WebGPU not available (use recent Chrome/Edge)", "bad");
    return null;
  }

  // ensure runtime with fallbacks
  let base = null;
  if (!haveWebLLM()) {
    setStatus(onStatus, "loading WebLLM runtime…", "warn");
    for (let i = 0; i < CDNS.length; i++) {
      try {
        await inject(CDNS[i]);
        if (haveWebLLM()) { base = BASES[i]; break; }
      } catch (_) { /* try next */ }
    }
    if (!haveWebLLM()) throw new Error("WebLLM runtime failed to load from all CDNs");
    if (!base) base = BASES[0];
  } else {
    base = BASES[0];
  }

  currentModel = modelId;
  setStatus(onStatus, "loading model… (first time may take minutes)", "warn");

  // create engine via worker; point to same CDN base for models/worker
  engine = await window.webllm.CreateWebWorkerMLCEngine(
    new URL(base),
    {
      model: currentModel,
      onProgress: (p) => {
        if (typeof p?.progress === "number") {
          const pct = Math.round(p.progress * 100);
          setStatus(onStatus, `downloading ${pct}%${p.text ? " – " + p.text : ""}`, "warn");
        } else if (p?.text) {
          setStatus(onStatus, p.text, "warn");
        }
      }
    }
  );

  setStatus(onStatus, `ready: ${currentModel}`, "ok");
  return engine;
}

export async function switchModel(modelId, onStatus) {
  try { engine?.unload?.(); } catch {}
  return initModel(modelId, onStatus);
}

export function sysPrompt(strategy) {
  if (strategy === "critic")
    return "Critique the prior approach in ≤5 bullets, then output improved answer prefixed with 'Final:'. Be concise and technical.";
  if (strategy === "plan")
    return "First output a numbered plan (3–7 steps), then execute it. Keep steps short and technical.";
  return "Continue this discussion from the provided context. Match tone and formatting. Be concise and technical.";
}

export async function run(messages, { temperature=0.7, max_tokens=1024, onToken } = {}) {
  if (!engine) throw new Error("Model not ready");
  let output = "";
  await engine.chat.completions.create(
    { stream: true, messages, temperature, max_tokens },
    { onToken: (t) => { output += t; onToken?.(output); } }
  );
  return output;
}
