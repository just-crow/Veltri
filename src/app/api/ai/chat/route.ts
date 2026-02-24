import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { nvidiaChat } from "@/lib/nvidia-ai";
import type { ChatMessage } from "@/lib/nvidia-ai";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 20 messages per minute
    const rlKey = getRateLimitKey(request, "ai-chat");
    const rl = rateLimit(rlKey, { limit: 20, windowSeconds: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { message, noteContent, history } = await request.json();

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Fetch all user notes for full context
    let allNotesContext = "";
    try {
      const { data: userNotes } = await (supabase as any)
        .from("notes")
        .select("title, raw_markdown")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(10);

        if (userNotes && userNotes.length > 0) {
          const summaries = (userNotes as any[])
            .map(
              (n, i) =>
                `[Note ${i + 1}: "${n.title}"]\n${(n.raw_markdown || "").substring(0, 800)}`
            )
            .join("\n---\n");
          allNotesContext = `\n\nThe user also has these other notes:\n${summaries}\n`;
        }
    } catch {
      // If we can't fetch notes, continue without them
    }

    const normalizedHistory: ChatMessage[] = Array.isArray(history)
      ? history
          .map((msg: { role?: string; content?: string }): ChatMessage => {
            const role: ChatMessage["role"] =
              msg.role === "system" || msg.role === "assistant" || msg.role === "user"
                ? msg.role
                : "user";
            return {
              role,
              content: String(msg.content || ""),
            };
          })
          .filter((msg) => msg.content.trim().length > 0)
      : [];

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are a helpful AI writing assistant. The user is working on a note and wants your help.

Here is the current note content:
---
${(noteContent || "").substring(0, 6000)}
---
${allNotesContext}
Answer the user's questions helpfully and concisely. Use **bold** and *italic* markdown for emphasis when useful. You have knowledge of all the user's notes shown above and can reference them.

You also have access to an insert tool. When you want to suggest inserting new text at a specific position in the note, use this exact format on its own line:
<insert_tool line="N">The text to insert here</insert_tool>
Replace N with the paragraph number (1 = insert before first paragraph, 2 = after first paragraph, etc.). Explain your suggestion before or after the tag. The user will see an Accept/Ignore prompt for each suggestion.`,
      },
      ...normalizedHistory,
      {
        role: "user",
        content: message,
      },
    ];

    const reply = await nvidiaChat(messages, {
      temperature: 0.5,
      maxTokens: 2000,
    });

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: "Chat failed: " + error.message },
      { status: 500 }
    );
  }
}
