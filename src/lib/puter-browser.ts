"use client";

import type { AIValidation, ChatMessage } from "@/lib/types";

interface PuterChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

type PuterMessageRole = "system" | "user" | "assistant" | "tool";

interface PuterMessage {
  role: PuterMessageRole;
  content: string;
}

interface PuterAI {
  chat: (...args: unknown[]) => Promise<unknown>;
}

interface PuterGlobal {
  ai?: PuterAI;
}

/**
 * Wait for the Puter.js SDK to be ready.
 * The <Script> tag loads it asynchronously — there can be a short delay
 * between when React components mount and when window.puter is available.
 */
async function waitForPuter(timeoutMs = 10_000): Promise<PuterGlobal> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const g = (globalThis as unknown as Record<string, unknown>).puter as PuterGlobal | undefined;
    if (g?.ai?.chat) return g;
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(
    "Puter AI is not available. Make sure you are connected to the internet and reload the page."
  );
}

function modelName(): string {
  if (typeof window !== "undefined") {
    // NEXT_PUBLIC_ vars are inlined at build time
    return process.env.NEXT_PUBLIC_PUTER_MODEL || "gpt-4o-mini";
  }
  return "gpt-4o-mini";
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;

    // Puter ChatResponse format: { message: { role, content } }
    const msg = data.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string" && msg.content.trim()) {
      return msg.content;
    }

    // Some models return text directly
    if (typeof data.text === "string" && data.text.trim()) return data.text;
    if (typeof data.content === "string" && data.content.trim()) return data.content;
    if (typeof data.response === "string" && data.response.trim()) return data.response;
    if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;

    // Fallback: toString()
    const str = String(value);
    if (str && str !== "[object Object]") return str;
  }

  return "";
}

function cleanModelText(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clampScore(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function calibrateQualityScore(params: {
  modelScore: number;
  isValid: boolean;
  feedback: string;
  accuracyScore?: number;
}): number {
  const feedback = params.feedback.toLowerCase();
  let score = clampScore(params.modelScore);

  if (typeof params.accuracyScore === "number" && !Number.isNaN(params.accuracyScore)) {
    score = clampScore(params.modelScore * 0.6 + params.accuracyScore * 0.4);
  }

  const severeInaccuracyPattern =
    /factual inaccuracies|factually incorrect|scientifically invalid|misleading|no educational value|not scientifically valid|hallucinated|fabricated/;
  const lowValuePattern =
    /not useful|unhelpful|too shallow|lacks depth|incomplete|does not teach|doesn't teach/;

  if (severeInaccuracyPattern.test(feedback)) {
    score = Math.min(score, 4);
  } else if (lowValuePattern.test(feedback)) {
    score = Math.min(score, 6);
  }

  if (!params.isValid) {
    score = Math.min(score, 6);
  }

  if (/structure is logical|well structured|well-organized/.test(feedback) && severeInaccuracyPattern.test(feedback)) {
    score = Math.min(score, 4);
  }

  return clampScore(score);
}

async function callPuter(promptOrMessages: string | PuterMessage[], options: PuterChatOptions): Promise<string> {
  const puter = await waitForPuter();
  const opts = { model: modelName(), ...options };

  let response: unknown;
  try {
    if (typeof promptOrMessages === "string") {
      // puter.ai.chat(prompt, options)
      response = await puter.ai!.chat(promptOrMessages, opts);
    } else {
      // puter.ai.chat([messages], options)
      response = await puter.ai!.chat(promptOrMessages, opts);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Puter AI] call failed:", msg);
    throw new Error(`AI request failed: ${msg}`);
  }

  const text = cleanModelText(extractText(response));
  if (!text) {
    console.warn("[Puter AI] empty response, raw:", response);
  }
  return text;
}

function buildFallbackSummary(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>\[\]!()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "This note contains useful material for study and revision.";

  const firstChunk = cleaned.slice(0, 260);
  const firstSentence = firstChunk.split(/(?<=[.!?])\s+/)[0]?.trim() || firstChunk;
  const secondSentence = "This summary was auto-generated from the beginning of the note.";

  return `${firstSentence} ${secondSentence}`.trim();
}

export async function generateSummaryWithPuter(content: string): Promise<string> {
  const prompt = `You are a professional content summarizer. Read the following note content and generate a concise 2-sentence summary that captures the key points. The summary should be suitable for SEO meta descriptions and feed previews. Only return the summary text, nothing else.\n\nNote content:\n${content.substring(0, 4000)}`;
  const summary = await callPuter(prompt, { temperature: 0.3, max_tokens: 220 });
  return summary || buildFallbackSummary(content);
}

export async function suggestTagsWithPuter(
  content: string,
  existingTags: string[] = []
): Promise<string[]> {
  const normalizedExistingTags = Array.from(
    new Set(
      existingTags
        .map((tag) => String(tag).toLowerCase().trim())
        .filter(Boolean)
    )
  );

  const prompt = `You are a content tagger. Read the following text and suggest 3 to 5 highly relevant tags/keywords that categorize this content.\n\nThe user already has these tags: ${normalizedExistingTags.length > 0 ? normalizedExistingTags.join(", ") : "none"}.\nPrioritize those existing tags first when they are still relevant, then add new tags only if needed.\n\nInclude ONE special authorship tag if relevant: either "ai-generated" or "human-generated".\n\nYou MUST respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) with this format:\n{"tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]}\n\nEach tag should be a single word or short phrase (max 2-3 words), lowercase, relevant to the content topic.\n\nText to tag:\n${content.substring(0, 4000)}`;

  const raw = await callPuter(prompt, { temperature: 0.3, max_tokens: 260 });
  const parsed = parseJsonObject(raw);
  const tagsRaw = parsed?.tags;
  if (!Array.isArray(tagsRaw)) {
    return normalizedExistingTags.length > 0
      ? normalizedExistingTags.slice(0, 8)
      : ["general", "human-generated"];
  }

  const aiTags = tagsRaw
    .map((tag) => String(tag).toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 8);

  const lowerContent = content.toLowerCase();
  const looksAiAuthored =
    /chatgpt|openai|gpt-|claude|gemini|copilot|llm|generated by ai|ai-generated/.test(
      lowerContent
    );

  const specialTags = looksAiAuthored
    ? ["ai-generated", "ai-assisted", "machine-generated"]
    : ["human-generated", "human-written", "original-content"];

  const tags = Array.from(
    new Set([...normalizedExistingTags, ...aiTags, ...specialTags])
  ).slice(0, 8);

  return tags.length > 0 ? tags : ["general"];
}

export async function validateWithPuter(content: string): Promise<AIValidation> {
  const prompt = `You are an educational content reviewer. Your job is to assess how useful and effective this material is for someone trying to learn. Focus primarily on learning value, not writing style.\n\nScore and give feedback on these criteria (in order of importance):\n1. Learning value — Does the content teach something clearly and effectively? Are concepts well-explained?\n2. Usefulness — Would a student or professional find this genuinely helpful? Does it solve a real problem or fill a knowledge gap?\n3. Depth & completeness — Is it thorough enough to be actionable, or does it leave too many gaps?\n4. Structure & clarity — Is it logically organized and easy to follow?\n5. Accuracy — Is the information factually correct and free of contradictions?\n6. Originality — Does it add real value beyond what anyone could Google in 10 seconds?\n\nGrammar and spelling are NOT a primary factor. Minor grammar issues should not significantly lower the score — prioritize substance over style.\n\nYou MUST respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) with these keys:\n{\n  "isValid": true or false (true if the content has good learning value with minor or no issues),\n  "feedback": "2-3 sentence feedback focusing on what makes this useful or not for learners. Mention the strongest and weakest aspects.",\n  "grammar_score": a number from 1 to 10 (10 = excellent learning resource, 1 = no educational value),\n  "accuracy_score": a number from 1 to 10 where factual correctness is scored strictly,\n  "learning_value_score": a number from 1 to 10 for practical teaching usefulness\n}\n\nScoring rule: If the content is factually wrong or misleading, grammar_score must be 4 or lower even if formatting/structure is good.\n\nText to review:\n${content.substring(0, 4000)}`;

  const raw = await callPuter(prompt, { temperature: 0.2, max_tokens: 1100 });
  const parsed = parseJsonObject(raw);

  if (!parsed) {
    return {
      isValid: false,
      feedback: "AI returned an unexpected response format. Please try again.",
      grammar_score: 5,
    };
  }

  const isValid = Boolean(parsed.isValid);
  const feedback = String(parsed.feedback || "No feedback provided");
  const modelScore = Number(parsed.grammar_score) || 5;
  const accuracyScore = Number(parsed.accuracy_score);

  return {
    isValid,
    feedback,
    grammar_score: calibrateQualityScore({
      modelScore,
      isValid,
      feedback,
      accuracyScore: Number.isNaN(accuracyScore) ? undefined : accuracyScore,
    }),
  };
}

export async function chatWithPuter(params: {
  message: string;
  noteContent: string;
  history: ChatMessage[];
}): Promise<string> {
  const messages: PuterMessage[] = [
    {
      role: "system",
      content: `You are a helpful AI writing assistant. The user is working on a note and wants your help.\n\nHere is the current note content:\n---\n${(params.noteContent || "").substring(0, 6000)}\n---\n\nAnswer the user's questions helpfully and concisely. Use **bold** and *italic* markdown for emphasis when useful.\n\nYou also have access to an insert tool. When you want to suggest inserting new text at a specific position in the note, use this exact format on its own line:\n<insert_tool line="N">The text to insert here</insert_tool>\nReplace N with the paragraph number (1 = insert before first paragraph, 2 = after first paragraph, etc.). Explain your suggestion before or after the tag. The user will see an Accept/Ignore prompt for each suggestion.`,
    },
    ...params.history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: "user",
      content: params.message,
    },
  ];

  const reply = await callPuter(messages, {
    temperature: 0.5,
    max_tokens: 2000,
  });

  return reply || "I couldn't generate a response.";
}

/**
 * Streaming variant of chatWithPuter.
 * Calls `onChunk` with each new text fragment as it arrives.
 * Falls back to non-streaming if the runtime does not support it.
 */
export async function chatWithPuterStream(params: {
  message: string;
  noteContent: string;
  history: ChatMessage[];
  onChunk: (chunk: string) => void;
}): Promise<string> {
  const puter = await waitForPuter();

  const messages: PuterMessage[] = [
    {
      role: "system",
      content: `You are a helpful AI writing assistant. The user is working on a note and wants your help.\n\nHere is the current note content:\n---\n${(params.noteContent || "").substring(0, 6000)}\n---\n\nAnswer the user's questions helpfully and concisely. Use **bold** and *italic* markdown for emphasis when useful.\n\nYou also have access to an insert tool. When you want to suggest inserting new text at a specific position in the note, use this exact format on its own line:\n<insert_tool line="N">The text to insert here</insert_tool>\nReplace N with the paragraph number (1 = insert before first paragraph, 2 = after first paragraph, etc.). Explain your suggestion before or after the tag. The user will see an Accept/Ignore prompt for each suggestion.`,
    },
    ...params.history.map((msg) => ({
      role: msg.role as PuterMessageRole,
      content: msg.content,
    })),
    { role: "user" as PuterMessageRole, content: params.message },
  ];

  let fullText = "";

  try {
    const response = await puter.ai!.chat(messages, {
      model: modelName(),
      temperature: 0.5,
      max_tokens: 2000,
      stream: true,
    });

    // Puter streaming returns an AsyncIterable of chunks
    for await (const chunk of response as AsyncIterable<{ text?: string; toString?: () => string }>) {
      const piece =
        typeof chunk === "string"
          ? chunk
          : chunk?.text ?? (typeof chunk?.toString === "function" ? chunk.toString() : "");
      if (piece) {
        fullText += piece;
        params.onChunk(piece);
      }
    }
  } catch {
    // Fallback: non-streaming
    const reply = await callPuter(messages, { temperature: 0.5, max_tokens: 2000 });
    fullText = reply;
    params.onChunk(reply);
  }

  return cleanModelText(fullText) || "I couldn't generate a response.";
}

export async function scoreWithPuter(params: {
  content: string;
  title: string;
}): Promise<{ score: number; reason: string }> {
  const prompt = `You are an AI content quality and relevancy rater. Rate the following note from 1 to 10 based on:
- Relevancy: Does the content stay focused and on-topic?
- Information quality: Is it well-researched, accurate, and genuinely useful?
- Depth and substance of the content
- Originality and genuine effort
- Clarity and readability

Title: ${params.title || "Untitled"}
Content (first 1500 chars): ${params.content.substring(0, 1500)}

Return only this JSON object, no markdown and no extra text:
{"score": 7, "reason": "Brief one-sentence reason focusing on relevancy and quality"}`;

  const raw = await callPuter(prompt, { temperature: 0.2, max_tokens: 300 });
  const parsed = parseJsonObject(raw);

  if (parsed) {
    const s = Number(parsed.score);
    if (Number.isFinite(s)) {
      return {
        score: clampScore(s),
        reason: String(parsed.reason || "Quality score generated").slice(0, 160),
      };
    }
  }

  return { score: 0, reason: "Could not parse score" };
}
