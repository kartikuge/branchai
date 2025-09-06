// ESM-based loader for WebLLM (no UMD, no /dist)
// Pin a recent version that works well in browsers
const VER = "0.2.79";  // or latest that works for you
let webllm;            // module namespace
let engine = null;
let currentModel = null;

function setStatus(cb, text, lvl="info"){ cb?.(text, lvl); }

export function getCurrentModel(){ return currentModel; }

export async function initModel(modelId, onStatus){
  if (!("gpu" in navigator)) {
    setStatus(onStatus, "WebGPU not available (update Chrome/Edge)", "bad");
    return null;
  }

  // dynamic-import the sdk from esm.run
  if (!webllm) {
    setStatus(onStatus, "loading WebLLM SDK…", "warn");
    webllm = await import(`https://esm.run/@mlc-ai/web-llm@${VER}`);
  }

  currentModel = modelId;
  setStatus(onStatus, "loading model… (first run downloads weights)", "warn");

  // Use the *prebuilt* engine (it knows where to fetch model libs/weights)
  engine = await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (p) => {
      // p has fields like progress, text
      if (typeof p?.progress === "number") {
        const pct = Math.round(p.progress * 100);
        setStatus(onStatus, `downloading ${pct}%${p.text ? " – "+p.text : ""}`, "warn");
      } else if (p?.text) {
        setStatus(onStatus, p.text, "warn");
      }
    },
    logLevel: "INFO",
  });

  setStatus(onStatus, `ready: ${modelId}`, "ok");
  return engine;
}

export async function switchModel(modelId, onStatus){
  try { engine?.unload?.(); } catch {}
  return initModel(modelId, onStatus);
}

export function sysPrompt(strategy) {
  if (strategy === "critic")
    return "Critique the prior approach in ≤5 bullets, then output improved answer prefixed with 'Final:'. Be concise and technical.";
  if (strategy === "plan")
    return "First output a numbered plan (3-7 steps), then execute it. Keep steps short and technical.";
  return "Continue this discussion from the provided context. Match tone and formatting. Be concise and technical.";
}

export async function run(messages, { temperature=0.7, max_tokens=1024, onToken } = {}){
  if (!engine) throw new Error("Model not ready");
  let acc = "";
  await engine.chat.completions.create(
    { stream: true, messages, temperature, max_tokens },
    { onToken: (t) => { acc += t; onToken?.(acc); } }
  );
  return acc;
}