import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { streamNvidia } from "@/lib/nvidia-ai";
import type { ChatMessage } from "@/lib/nvidia-ai";

const SYSTEM_PROMPT = `You are a helpful AI writing assistant. The user is working on a note and wants your help.

Answer the user's questions helpfully and concisely. Use **bold** and *italic* markdown for emphasis when useful.

You also have access to an insert tool. When you want to suggest inserting new text at a specific position in the note, use this exact format on its own line:
<insert_tool line="N">The text to insert here</insert_tool>
Replace N with the paragraph number (1 = insert before first paragraph, 2 = after first paragraph, etc.). Explain your suggestion before or after the tag. The user will see an Accept/Ignore prompt for each suggestion.`;

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // Rate limit
    const rlKey = getRateLimitKey(request, "ai-chat-stream");
    const rl = rateLimit(rlKey, { limit: 20, windowSeconds: 60 });
    if (!rl.success) {
      return new Response(JSON.stringify({ error: "Too many requests." }), { status: 429 });
    }

    const { message, noteContent, history = [] } = await request.json();

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Message is required" }), { status: 400 });
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\nHere is the current note content:\n---\n${(noteContent || "").substring(0, 6000)}\n---`,
      },
      ...history
        .filter((m: { role: string }) => ["user", "assistant"].includes(m.role))
        .slice(-20)
        .map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      { role: "user", content: message },
    ];

    // Return a streaming SSE response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of streamNvidia(messages, { temperature: 0.5, maxTokens: 4096 })) {
            const data = `data: ${JSON.stringify({ chunk })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: "\n\n[Error: stream interrupted]" })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Stream failed";
    console.error("Chat stream error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
