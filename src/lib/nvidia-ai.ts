// NVIDIA NIM API client (server-side)
// Model: stepfun-ai/step-3.5-flash (override via NVIDIA_MODEL env var)
// OpenAI-compatible endpoint: https://integrate.api.nvidia.com/v1

export type ChatRole = "system" | "user" | "assistant" | "tool"

export interface ChatMessage {
  role: ChatRole
  content: string
}

interface NvidiaOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

interface ChatCompletionsChoice {
  message?: { content?: string | null; reasoning_content?: string | null }
  delta?: { content?: string; reasoning_content?: string }
}

interface ChatCompletionsResponse {
  choices?: ChatCompletionsChoice[]
}

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
const DEFAULT_MODEL = "stepfun-ai/step-3.5-flash"

function getModel(options?: NvidiaOptions): string {
  return options?.model || process.env.NVIDIA_MODEL || DEFAULT_MODEL
}

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY
  if (!key) throw new Error("Missing NVIDIA_API_KEY environment variable")
  return key
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
}

function normalizeResponse(data: ChatCompletionsResponse): string {
  const msg = data.choices?.[0]?.message
  // content = actual answer, reasoning/reasoning_content = thinking (never use as answer)
  const raw = msg?.content?.trim() || ""
  return stripThinking(raw)
}

function localChatFallback(messages: ChatMessage[]): string {
  const userMessage = [...messages].reverse().find((m) => m.role === "user")?.content || ""
  const trimmed = userMessage.trim()
  if (!trimmed) return "Share what you want to improve in your note, and I can suggest structure, clarity, and wording changes."
  return `I can help refine this. Start by clarifying your key point, then add one concrete example. Draft to improve: "${trimmed.slice(0, 180)}"`
}

function localPromptFallback(prompt: string): string {
  const lowered = prompt.toLowerCase()
  if (lowered.includes('"tags"')) return JSON.stringify({ tags: ["general", "notes", "study"] })
  if (lowered.includes('"isvalid"')) return "__AI_UNAVAILABLE__"
  if (lowered.includes('"score"') && lowered.includes('"reason"')) return "__AI_UNAVAILABLE__"
  if (lowered.includes("concise 2-sentence summary")) {
    const source = prompt.replace(/[\s\S]*Note content:\n/, "").trim().slice(0, 260)
    return `${source.split(/(?<=[.!?])\s+/)[0] || source} This summary was auto-generated.`
  }
  return "I couldn't reach the AI provider. Please try again shortly."
}

async function callNvidia(messages: ChatMessage[], options?: NvidiaOptions, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000) // 30s timeout
    try {
      const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: getModel(options),
          messages,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 4096,
          top_p: 1,
          stream: false,
        }),
        signal: controller.signal,
        cache: "no-store" as RequestCache,
      })
      clearTimeout(timeout)
      if (!res.ok) {
        const body = await res.text()
        console.error(`NVIDIA API ${res.status} (attempt ${attempt + 1}/${retries + 1}):`, body)
        if (attempt < retries && (res.status >= 500 || res.status === 429)) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
          continue
        }
        return null
      }
      const data = (await res.json()) as ChatCompletionsResponse
      const result = normalizeResponse(data)
      if (!result && attempt < retries) {
        console.warn(`NVIDIA returned empty content (attempt ${attempt + 1}/${retries + 1}), retrying...`)
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      return result || null
    } catch (err: any) {
      clearTimeout(timeout)
      const isTimeout = err?.name === "AbortError"
      console.error(`NVIDIA API ${isTimeout ? "timeout" : "error"} (attempt ${attempt + 1}/${retries + 1}):`, err?.message || err)
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        continue
      }
      return null
    }
  }
  return null
}

// Streaming call — yields text chunks, stripping <think>...</think> blocks.
// Strategy: accumulate ALL model text into a buffer. Only start emitting once
// we've confirmed the think block is fully closed (</think> found), or after
// 50 chars with no opening <think> tag at all.
export async function* streamNvidia(messages: ChatMessage[], options?: NvidiaOptions): AsyncGenerator<string> {
  const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: getModel(options),
      messages,
      temperature: options?.temperature ?? 0.5,
      max_tokens: options?.maxTokens ?? 4096,
      top_p: 1,
      stream: true,
    }),
  })

  if (!res.ok || !res.body) {
    console.error(`NVIDIA stream error ${res.status}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let sseBuffer = ""  // raw SSE line accumulator
  let modelText = ""  // all model text received so far
  let emitFrom = 0    // index in modelText from which we have already yielded
  let thinkStripped = false // have we finished stripping the think block?

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    sseBuffer += decoder.decode(value, { stream: true })
    const lines = sseBuffer.split("\n")
    sseBuffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const json = trimmed.slice(5).trim()
      if (json === "[DONE]") {
        // Flush any remaining unemitted text
        const remaining = modelText.slice(emitFrom)
        if (remaining) yield remaining
        return
      }
      try {
        const parsed = JSON.parse(json) as ChatCompletionsResponse
        // reasoning_content = thinking phase (skip it); content = actual reply
        const chunk = parsed.choices?.[0]?.delta?.content
        if (!chunk) continue

        modelText += chunk

        if (!thinkStripped) {
          const closeIdx = modelText.indexOf("</think>")
          if (closeIdx !== -1) {
            // Found closing tag — skip everything up to and including it
            emitFrom = closeIdx + 8
            // Skip leading newlines after </think>
            while (emitFrom < modelText.length && modelText[emitFrom] === "\n") emitFrom++
            thinkStripped = true
          } else if (modelText.length > 50 && !modelText.includes("<think>")) {
            // No think block present — emit from the start
            thinkStripped = true
            emitFrom = 0
          }
          // else: still waiting for </think>, hold back
        }

        if (thinkStripped && emitFrom < modelText.length) {
          yield modelText.slice(emitFrom)
          emitFrom = modelText.length
        }
      } catch { /* skip malformed lines */ }
    }
  }
}

export async function nvidiaPrompt(prompt: string, options?: NvidiaOptions): Promise<string> {
  const result = await callNvidia([{ role: "user", content: prompt }], options)
  return result || localPromptFallback(prompt)
}

export async function nvidiaChat(messages: ChatMessage[], options?: NvidiaOptions): Promise<string> {
  const result = await callNvidia(messages, options)
  return result || localChatFallback(messages)
}
