import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { nvidiaPrompt } from "@/lib/nvidia-ai";

function clampScore(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(10, Math.max(1, Math.round(numeric)));
}

function parseScoreResponse(rawInput: string): { score: number; reason: string } | null {
  // Strip both closed <think>...</think> blocks and unclosed <think>... (model ran out of tokens mid-think)
  const raw = rawInput
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*/gi, "")
    .replace(/```json|```/gi, "")
    .trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const parsedScore = clampScore(parsed?.score);
      if (parsedScore !== null) {
        const parsedReason = String(parsed?.reason || "Quality score generated").trim();
        return { score: parsedScore, reason: parsedReason.slice(0, 160) };
      }
    } catch {
      // Fall through to regex-based parsing
    }
  }

  const scoreMatch = raw.match(/(?:"score"\s*:\s*|score\s*[:=-]?\s*)(\d+(?:\.\d+)?)/i);
  const fallbackScore = clampScore(scoreMatch?.[1]);
  if (fallbackScore === null) return null;

  const reasonMatch = raw.match(/(?:"reason"\s*:\s*"([^"]+)"|reason\s*[:=-]\s*([^\n\r]+))/i);
  const fallbackReason = (reasonMatch?.[1] || reasonMatch?.[2] || "Quality score generated")
    .trim()
    .replace(/^"|"$/g, "");

  return { score: fallbackScore, reason: fallbackReason.slice(0, 160) };
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    // Rate limit: 10 requests per minute
    const rlKey = getRateLimitKey(request, "ai-score");
    const rl = rateLimit(rlKey, { limit: 10, windowSeconds: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { content, title } = await request.json();

    if (!content || content.trim().length < 20) {
      return NextResponse.json({ score: 0, reason: "Content too short to rate" });
    }

    const prompt = `You are an AI content quality and relevancy rater. Rate the following note from 1 to 10 based on:
- Relevancy: Does the content stay focused and on-topic?
- Information quality: Is it well-researched, accurate, and genuinely useful?
- Depth and substance of the content
- Originality and genuine effort
- Clarity and readability

Title: ${title || "Untitled"}
Content (first 1500 chars): ${content.substring(0, 1500)}

Return only this JSON object, no markdown and no extra text:
{"score": 7, "reason": "Brief one-sentence reason focusing on relevancy and quality"}`;

    const raw = await nvidiaPrompt(prompt, { temperature: 0.2, maxTokens: 2048, noThink: true });
    const parsed = parseScoreResponse(raw);

    if (!parsed) {
      return NextResponse.json({ score: 0, reason: "Could not parse score" });
    }

    const score = parsed.score;
    const reason = parsed.reason;

    return NextResponse.json({ score, reason });
  } catch (error: any) {
    console.error("Score error:", error);
    return NextResponse.json({ score: 0, reason: "Scoring failed" });
  }
}
