import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { nvidiaPrompt } from "@/lib/nvidia-ai";

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

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    // Rate limit: 10 requests per minute
    const rlKey = getRateLimitKey(request, "ai-summary");
    const rl = rateLimit(rlKey, { limit: 10, windowSeconds: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { content, noteId } = await request.json();

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const prompt = `Write a concise 2-sentence description of the note content below, suitable for use as an SEO meta description. Output ONLY the description itself — no labels, no introductory phrases, no quotation marks, no explanations. Begin immediately with the first word of the description.

Note content:
${content.substring(0, 4000)}`;

    let summary = await nvidiaPrompt(prompt, { temperature: 0.3, maxTokens: 4096 });

    if (!summary) {
      summary = buildFallbackSummary(content);
    } else {
      // Strip any preamble the model may still prepend (e.g. 'Here is a summary:')
      summary = summary
        .replace(/^["']/, "")                          // leading quote
        .replace(/["']$/, "")                          // trailing quote
        .replace(/^(here is|here's|below is|this is)[^:]*:\s*/i, "")
        .replace(/^[^:]*\bsummary\b[^:]*:\s*/i, "")
        .replace(/^[^:]*\bdescription\b[^:]*:\s*/i, "")
        .trim();

    }

    // If noteId is provided, save the summary to the database
    if (noteId) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();

      // Verify the current user owns this note (prevent IDOR)
      const { data: noteData } = await (supabase as any)
        .from("notes")
        .select("*")
        .eq("id", noteId)
        .single();
      const note = noteData as { user_id: string } | null;

      if (!note || note.user_id !== user!.id) {
        return NextResponse.json(
          { error: "Not authorized to update this note" },
          { status: 403 }
        );
      }

      await (supabase as any)
        .from("notes")
        .update({ summary: summary })
        .eq("id", noteId);
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error("Summary generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary: " + error.message },
      { status: 500 }
    );
  }
}
