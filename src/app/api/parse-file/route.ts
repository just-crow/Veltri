import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { sanitizeHtml } from "@/lib/sanitize";

// Must run in Node.js — pdf-parse and mammoth are not Edge-compatible
export const runtime = "nodejs";
export const maxRequestBodySize = "15mb";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".md", ".txt"];

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    // Rate limit: 10 uploads per minute
    const rlKey = getRateLimitKey(request, "parse-file");
    const rl = rateLimit(rlKey, { limit: 10, windowSeconds: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10 MB." },
        { status: 400 }
      );
    }

    const name = file.name.toLowerCase();

    // Validate file extension
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!hasValidExt) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (name.endsWith(".pdf")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      const text = (data.text as string) || "";
      const html = sanitizeHtml(
        text
          .split("\n")
          .map((l: string) => (l.trim() === "" ? "<p></p>" : `<p>${l}</p>`))
          .join("")
      );
      return NextResponse.json({ html, text });
    }

    if (name.endsWith(".docx")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ buffer });
      const html = sanitizeHtml(result.value || "");
      // Strip tags for plain text
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return NextResponse.json({ html, text });
    }

    // Fallback: plain text / markdown
    const text = await file.text();
    const isMarkdown = name.endsWith(".md");

    if (isMarkdown) {
      const lines = text.split("\n");
      const result: string[] = [];
      let inCode = false,
        codeBuf = "",
        codeLang = "";
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const inline = (s: string) =>
        s
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/`(.+?)`/g, "<code>$1</code>");
      for (const raw of lines) {
        if (raw.startsWith("```")) {
          if (!inCode) {
            inCode = true;
            codeLang = raw.slice(3).trim() || "text";
            codeBuf = "";
          } else {
            result.push(
              `<pre><code class="language-${codeLang}">${esc(codeBuf.trimEnd())}</code></pre>`
            );
            inCode = false;
          }
          continue;
        }
        if (inCode) {
          codeBuf += raw + "\n";
          continue;
        }
        if (/^### /.test(raw)) { result.push(`<h3>${inline(raw.slice(4))}</h3>`); continue; }
        if (/^## /.test(raw)) { result.push(`<h2>${inline(raw.slice(3))}</h2>`); continue; }
        if (/^# /.test(raw)) { result.push(`<h1>${inline(raw.slice(2))}</h1>`); continue; }
        if (/^[-*] /.test(raw)) { result.push(`<ul><li>${inline(raw.slice(2))}</li></ul>`); continue; }
        result.push(raw.trim() === "" ? "<p></p>" : `<p>${inline(raw)}</p>`);
      }
      return NextResponse.json({ html: sanitizeHtml(result.join("")), text });
    }

    // Plain text
    const html = sanitizeHtml(
      text
        .split("\n")
        .map((l) => (l.trim() === "" ? "<p></p>" : `<p>${l}</p>`))
        .join("")
    );
    return NextResponse.json({ html, text });
  } catch (error: any) {
    console.error("Parse file error:", error);
    return NextResponse.json(
      { error: "Failed to parse file: " + error.message },
      { status: 500 }
    );
  }
}
