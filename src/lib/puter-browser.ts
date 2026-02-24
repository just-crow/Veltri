"use client";

import type { AIValidation, ChatMessage } from "@/lib/types";

// All AI calls go through our own Next.js API routes, which use NVIDIA NIM.
// Model: meta/llama-3.3-70b-instruct

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

  const firstChunk = cleaned.slice(0, 260);
  const firstSentence = firstChunk.split(/(?<=[.!?])\s+/)[0]?.trim() || firstChunk;
  return `${firstSentence} This summary was auto-generated from the beginning of the note.`.trim();
}

export async function generateSummaryWithPuter(content: string): Promise<string> {
  try {
    const data = await post<{ summary?: string }>("/api/ai/summary", { content });
    return data.summary || buildFallbackSummary(content);
  } catch {
    return buildFallbackSummary(content);
  }
}

export async function suggestTagsWithPuter(
  content: string,
  existingTags: string[] = []
): Promise<string[]> {
  try {
    const data = await post<{ tags?: string[] }>("/api/ai/tags", { content, existingTags });
    return data.tags || ["general"];
  } catch {
    return ["general", "notes"];
  }
}

export async function validateWithPuter(content: string): Promise<AIValidation> {
  try {
    const data = await post<{
      isValid?: boolean;
      feedback?: string;
      grammar_score?: number;
    }>("/api/ai/validate", { content });

    return {
      isValid: Boolean(data.isValid),
      feedback: data.feedback || "No feedback provided.",
      grammar_score: data.grammar_score ?? 5,
    };
  } catch {
    return {
      isValid: false,
      feedback: "Could not validate content. Please try again.",
      grammar_score: 5,
    };
  }
}

export async function chatWithPuter(params: {
  message: string;
  noteContent: string;
  history: ChatMessage[];
}): Promise<string> {
  const data = await post<{ reply?: string }>("/api/ai/chat", {
    message: params.message,
    noteContent: params.noteContent,
    history: params.history,
  });
  return data.reply || "I couldn't generate a response.";
}

// Streaming: calls the chat route and simulates streaming by delivering the
// full response in one chunk (NVIDIA NIM streaming can be added later).
export async function chatWithPuterStream(params: {
  message: string;
  noteContent: string;
  history: ChatMessage[];
  onChunk: (chunk: string) => void;
}): Promise<string> {
  const reply = await chatWithPuter({
    message: params.message,
    noteContent: params.noteContent,
    history: params.history,
  });
  params.onChunk(reply);
  return reply;
}

export async function scoreWithPuter(params: {
  content: string;
  title: string;
}): Promise<{ score: number; reason: string }> {
  try {
    const data = await post<{ score?: number; reason?: string }>("/api/ai/score", {
      content: params.content,
      title: params.title,
    });
    return {
      score: data.score ?? 0,
      reason: data.reason || "Score generated.",
    };
  } catch {
    return { score: 0, reason: "Scoring failed." };
  }
}
