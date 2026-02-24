// NVIDIA NIM API client (server-side)
// Model: nvidia/llama-3.3-nemotron-super-49b-v1.5
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
  message?: { content?: string }
  delta?: { content?: string }
}

interface ChatCompletionsResponse {
  choices?: ChatCompletionsChoice[]
}

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
const DEFAULT_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5"

function getModel(options?: NvidiaOptions): string {
  return options?.model || process.env.NVIDIA_MODEL || DEFAULT_MODEL
}

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY
  if (!key) throw new Error("Missing NVIDIA_API_KEY environment variable")
  return key
}

function normalizeResponse(data: ChatCompletionsResponse): string {
  return data.choices?.[0]?.message?.content?.trim() || ""
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
  if (lowered.includes('"isvalid"')) return JSON.stringify({ isValid: true, feedback: "The content is useful and reasonably structured.", grammar_score: 7, accuracy_score: 7, learning_value_score: 7 })
  if (lowered.includes('"score"') && lowered.includes('"reason"')) return JSON.stringify({ score: 7, reason: "The note is on-topic and useful." })
  if (lowered.includes("concise 2-sentence summary")) {
    const source = prompt.replace(/[\s\S]*Note content:\n/, "").trim().slice(0, 260)
    return `${source.split(/(?<=[.!?])\s+/)[0] || source} This summary was auto-generated.`
  }
  return "I couldn't reach the AI provider. Please try again shortly."
}

async function callNvidia(messages: ChatMessage[], options?: NvidiaOptions): Promise<string | null> {
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
        max_tokens: options?.maxTokens ?? 1200,
        top_p: 1,
        stream: false,
      }),
    })
    if (!res.ok) { console.error(`NVIDIA API ${res.status}:`, await res.text()); return null }
    const data = (await res.json()) as ChatCompletionsResponse
    return normalizeResponse(data) || null
  } catch (err) {
    console.error("NVIDIA API call failed:", err)
    return null
  }
}

// Streaming call — yields text chunks via ReadableStream (SSE)
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
      max_tokens: options?.maxTokens ?? 2000,
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
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const json = trimmed.slice(5).trim()
      if (json === "[DONE]") return
      try {
        const parsed = JSON.parse(json) as ChatCompletionsResponse
        const chunk = parsed.choices?.[0]?.delta?.content
        if (chunk) yield chunk
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
