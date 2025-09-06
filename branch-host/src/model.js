// WHY: isolate WebLLM details (init, switching models, streaming generation).
const webllm = window.webllm;

let engine = null;
let currentModel = null;

export function getCurrentModel() { return currentModel; }

export async function initModel(modelId, onStatus) {
  if (!('gpu' in navigator)) {
    onStatus?.('WebGPU not available', 'bad');
    return null;
  }
  onStatus?.('loading model… (first time may take minutes)', 'warn');
  currentModel = modelId;
  engine = await webllm.CreateWebWorkerMLCEngine(
    new URL("https://unpkg.com/@mlc-ai/web-llm@0.2.62/dist/"),
    { model: modelId }
  );
  onStatus?.(`ready: ${modelId}`, 'ok');
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
  await engine.chat.completions.create({
    stream: true, messages, temperature, max_tokens
  }, {
    onToken: (t) => { output += t; onToken?.(output); }
  });
  return output;
}
