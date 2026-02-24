import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { nvidiaPrompt } from "@/lib/nvidia-ai";

// Allow up to 60s for AI validation (model can take 10-15s per attempt, with retries)
export const maxDuration = 60;

function clampScore(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function calibrateQualityScore(params: {
  modelScore: number;
  isValid: boolean;
  feedback: string;
  accuracyScore?: number;
  essayScore?: number;
}): number {
  const feedback = params.feedback.toLowerCase();
  let score = clampScore(params.modelScore);

  // Blend in accuracy and essay quality when available
  const hasAccuracy = typeof params.accuracyScore === "number" && !Number.isNaN(params.accuracyScore);
  const hasEssay = typeof params.essayScore === "number" && !Number.isNaN(params.essayScore);

  if (hasAccuracy && hasEssay) {
    score = clampScore(params.modelScore * 0.4 + params.accuracyScore! * 0.3 + params.essayScore! * 0.3);
  } else if (hasAccuracy) {
    score = clampScore(params.modelScore * 0.6 + params.accuracyScore! * 0.4);
  } else if (hasEssay) {
    score = clampScore(params.modelScore * 0.6 + params.essayScore! * 0.4);
  }

  const severeInaccuracyPattern =
    /factual inaccuracies|factually incorrect|scientifically invalid|misleading|no educational value|not scientifically valid|hallucinated|fabricated/;

  if (severeInaccuracyPattern.test(feedback)) {
    score = Math.min(score, 4);
  }

  if (!params.isValid) {
    score = Math.min(score, 5);
  }

  return clampScore(score);
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    // Rate limit: 10 requests per minute
    const rlKey = getRateLimitKey(request, "ai-validate");
    const rl = rateLimit(rlKey, { limit: 10, windowSeconds: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { content } = await request.json();

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const prompt = `You are a fair and encouraging content reviewer. Your job is to evaluate this piece of writing holistically — it could be educational notes, an essay, a tutorial, or any informational content. Be balanced: acknowledge strengths alongside weaknesses. Think step by step.

Evaluate on these criteria:
1. Content value — Does it teach, inform, or argue something meaningful? Are ideas well-explained?
2. Writing quality — Is the writing clear, coherent, and well-structured? Does the argument or explanation flow logically? (This is what a teacher would grade for essay quality.)
3. Depth — Is it thorough enough for its intended purpose?
4. Accuracy — Is the information factually correct?
5. Originality — Does it offer genuine insight beyond surface-level knowledge?

Important guidelines:
- Minor grammar/spelling issues should NOT significantly lower the score.
- Short but clear content can still score well if it's accurate and useful.
- Personal essays and opinion pieces should be judged on reasoning quality, not just factual density.
- The content is almost never entertainment or clickbait, so do not penalize for lack of "engagement" or "virality", and do not validate it for the same.
- The score lowers as the content becomes more misleading, inaccurate, plagiarized, or completely off-topic. If the content is mostly accurate and has educational value but contains some minor errors or could be improved in clarity, it can still receive a decent score (e.g., 6-7). Only severely flawed content that is mostly inaccurate, plagiarized, or has no educational value should receive a very low score (1-3).
- If the content is misfactual, you should provide a low score.

Now, evaluate the content below and provide:

You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no extra text):
{
  "isValid": true or false (true if the content has reasonable quality — only false for spam, gibberish, or dangerously wrong information),
  "feedback": "2-3 sentences: highlight the strongest aspect, mention the biggest area for improvement, and give an overall impression. Be constructive.",
  "quality_score": number 1-10 (overall content quality — 5 = average, 7 = good, 9+ = exceptional),
  "accuracy_score": number 1-10 (factual correctness — be strict only on clear factual errors),
  "essay_score": number 1-10 (writing quality, structure, argumentation, clarity — what a teacher would grade)
}

Text to review:
${content.substring(0, 4000)}`;

    const responseText = await nvidiaPrompt(prompt, { temperature: 0.3, maxTokens: 8192 });

    if (responseText === "__AI_UNAVAILABLE__") {
      return NextResponse.json(
        { error: "AI service is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    // Extract JSON from potential markdown code blocks
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        {
          isValid: false,
          feedback: "AI returned an unexpected response format. Raw: " + responseText.substring(0, 200),
          grammar_score: 5,
        }
      );
    }

    try {
      const validation = JSON.parse(jsonMatch[0]);
      const isValid = Boolean(validation.isValid);
      const feedback = String(validation.feedback || "No feedback provided");
      // Accept both old and new field names
      const modelScore = Number(validation.quality_score ?? validation.grammar_score) || 5;
      const accuracyScore = Number(validation.accuracy_score);
      const essayScore = Number(validation.essay_score);
      const calibratedScore = calibrateQualityScore({
        modelScore,
        isValid,
        feedback,
        accuracyScore: Number.isNaN(accuracyScore) ? undefined : accuracyScore,
        essayScore: Number.isNaN(essayScore) ? undefined : essayScore,
      });

      return NextResponse.json({
        isValid,
        feedback,
        grammar_score: calibratedScore,
        accuracy_score: Number.isNaN(accuracyScore) ? null : clampScore(accuracyScore),
      });
    } catch {
      return NextResponse.json({
        isValid: false,
        feedback: "Could not parse AI response. Please try again.",
        grammar_score: 5,
        accuracy_score: null,
      });
    }
  } catch (error: any) {
    console.error("Validation error:", error);
    return NextResponse.json(
      { error: "Failed to validate content: " + error.message },
      { status: 500 }
    );
  }
}
