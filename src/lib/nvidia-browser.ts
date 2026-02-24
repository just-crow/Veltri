"use client";

import type { AIValidation, ChatMessage } from "@/lib/types";

// Client-side AI helper — all calls go through /api/ai/* routes (NVIDIA NIM)
// Model: nvidia/llama-3.3-nemotron-super-49b-v1.5

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function buildFallbackSummary(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>\[\]!()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "This note contains useful material for study and revision.";
  const firstSentence = cleaned.slice(0, 260).split(/(?<=[.!?])\s+/)[0]?.trim() || cleaned.slice(0, 260);
  return `${firstSentence} This summary was auto-generated from the note content.`.trim();
}

export async function generateSummary(content: string): Promise<string> {
  try {
    const data = await post<{ summary?: string }>("/api/ai/summary", { content });
    return data.summary || buildFallbackSummary(content);
  } catch {
    return buildFallbackSummary(content);
  }
}

export async function suggestTags(content: string, existingTags: string[] = []): Promise<string[]> {
  try {
    const data = await post<{ tags?: string[] }>("/api/ai/tags", { content, existingTags });
    return data.tags || ["general"];
  } catch {
    return ["general", "notes"];
  }
}

export async function validateContent(content: string): Promise<AIValidation> {
  try {
    const data = await post<{ isValid?: boolean; feedback?: string; grammar_score?: number }>(
      "/api/ai/validate",
      { content }
    );
    return {
      isValid: Boolean(data.isValid),
      feedback: data.feedback || "No feedback provided.",
      grammar_score: data.grammar_score ?? 5,
    };
  } catch {
    return { isValid: false, feedback: "Could not validate content. Please try again.", grammar_score: 5 };
  }
}

export async function scoreNote(params: { content: string; title: string }): Promise<{ score: number; reason: string }> {
  try {
    const data = await post<{ score?: number; reason?: string }>("/api/ai/score", params);
    return { score: data.score ?? 0, reason: data.reason || "Score generated." };
  } catch {
    return { score: 0, reason: "Scoring failed." };
  }
}

// Streaming chat — calls /api/ai/chat/stream and delivers chunks via onChunk
export async function chatStream(params: {
  message: string;
  noteContent: string;
  history: ChatMessage[];
  onChunk: (chunk: string) => void;
}): Promise<string> {
  const res = await fetch("/api/ai/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: params.message,
      noteContent: params.noteContent,
      history: params.history,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const json = trimmed.slice(5).trim();
      if (json === "[DONE]") return fullText;
      try {
        const parsed = JSON.parse(json) as { chunk?: string };
        if (parsed.chunk) {
          fullText += parsed.chunk;
          params.onChunk(parsed.chunk);
        }
      } catch { /* skip */ }
    }
  }

  return fullText;
}

// Non-streaming fallback
export async function chat(params: {
  message: string;
  noteContent: string;
  history: ChatMessage[];
}): Promise<string> {
  const data = await post<{ reply?: string }>("/api/ai/chat", params);
  return data.reply || "I couldn't generate a response.";
}

// Legacy aliases so existing imports don't break during migration
export const generateSummaryWithPuter = generateSummary;
export const suggestTagsWithPuter = suggestTags;
export const validateWithPuter = validateContent;
export const scoreWithPuter = scoreNote;
export const chatWithPuterStream = chatStream;
export const chatWithPuter = chat;
