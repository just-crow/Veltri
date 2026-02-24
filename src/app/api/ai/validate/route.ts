import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { nvidiaPrompt } from "@/lib/nvidia-ai";

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

    const prompt = `You are an educational content reviewer. Your job is to assess how useful and effective this material is for someone trying to learn. Focus primarily on learning value, not writing style.

Score and give feedback on these criteria (in order of importance):
1. Learning value — Does the content teach something clearly and effectively? Are concepts well-explained?
2. Usefulness — Would a student or professional find this genuinely helpful? Does it solve a real problem or fill a knowledge gap?
3. Depth & completeness — Is it thorough enough to be actionable, or does it leave too many gaps?
4. Structure & clarity — Is it logically organized and easy to follow?
5. Accuracy — Is the information factually correct and free of contradictions?
6. Originality — Does it add real value beyond what anyone could Google in 10 seconds?

Grammar and spelling are NOT a primary factor. Minor grammar issues should not significantly lower the score — prioritize substance over style.

You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) with these keys:
{
  "isValid": true or false (true if the content has good learning value with minor or no issues),
  "feedback": "2-3 sentence feedback focusing on what makes this useful or not for learners. Mention the strongest and weakest aspects.",
  "grammar_score": a number from 1 to 10 (10 = excellent learning resource, 1 = no educational value),
  "accuracy_score": a number from 1 to 10 where factual correctness is scored strictly,
  "learning_value_score": a number from 1 to 10 for practical teaching usefulness
}

Scoring rule: If the content is factually wrong or misleading, grammar_score must be 4 or lower even if formatting/structure is good.

Text to review:
${content.substring(0, 4000)}`;

    const responseText = await nvidiaPrompt(prompt, {
      temperature: 0.2,
      maxTokens: 1100,
    });

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
      const modelScore = Number(validation.grammar_score) || 5;
      const accuracyScore = Number(validation.accuracy_score);
      const calibratedScore = calibrateQualityScore({
        modelScore,
        isValid,
        feedback,
        accuracyScore: Number.isNaN(accuracyScore) ? undefined : accuracyScore,
      });

      return NextResponse.json({
        isValid,
        feedback,
        grammar_score: calibratedScore,
      });
    } catch {
      return NextResponse.json({
        isValid: false,
        feedback: "Could not parse AI response. Please try again.",
        grammar_score: 5,
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
