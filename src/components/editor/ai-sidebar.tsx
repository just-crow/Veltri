"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Sparkles,
  CheckCircle,
  Tags,
  Loader2,
  Send,
  X,
  AlertTriangle,
  ThumbsUp,
  Trash2,
  FilePen,
} from "lucide-react";
import type { AIValidation, ChatMessage } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import DOMPurify from "isomorphic-dompurify";
import {
  chatWithPuterStream,
  generateSummaryWithPuter,
  suggestTagsWithPuter,
  validateWithPuter,
} from "@/lib/nvidia-browser";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InsertSuggestion {
  line: number;
  content: string;
  pending: boolean; // true while still streaming the insert content
}

interface AssistantMessage {
  role: "assistant";
  content: string;           // visible text (no insert_tool tags)
  insertions: InsertSuggestion[];
  rawBuffer: string;         // full raw text including in-progress insert_tool tags
}

type DisplayMessage = { role: "user"; content: string } | AssistantMessage;

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = (noteId: string | null) =>
  noteId ? `veltri-chat-${noteId}` : null;

function loadHistory(noteId: string | null): DisplayMessage[] {
  try {
    const key = STORAGE_KEY(noteId);
    if (!key) return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as DisplayMessage[];
  } catch {
    return [];
  }
}

function saveHistory(noteId: string | null, messages: DisplayMessage[]) {
  try {
    const key = STORAGE_KEY(noteId);
    if (!key) return;
    // Only persist completed messages (no pending insertions)
    const clean = messages.map((m) => {
      if (m.role !== "assistant") return m;
      return {
        ...m,
        insertions: m.insertions.map((ins) => ({ ...ins, pending: false })),
        rawBuffer: m.content,
      };
    });
    localStorage.setItem(key, JSON.stringify(clean));
  } catch { /* quota errors — silently ignore */ }
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderMd(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="bg-background/70 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<p class="font-bold text-sm mt-2">$1</p>')
    .replace(/^## (.+)$/gm, '<p class="font-semibold text-sm mt-2">$1</p>')
    .replace(/^# (.+)$/gm, '<p class="font-bold mt-2">$1</p>')
    .replace(/\n/g, "<br/>");
}

// ─── Stream parser ────────────────────────────────────────────────────────────
// Given the raw accumulated buffer, produces:
//   visibleText  — text with insert_tool tags stripped out
//   insertions   — list of detected insertions (pending if </insert_tool> not yet seen)

function parseStreamBuffer(raw: string): { visibleText: string; insertions: InsertSuggestion[] } {
  const insertions: InsertSuggestion[] = [];
  let visibleText = "";
  let i = 0;

  while (i < raw.length) {
    const startTag = raw.indexOf("<insert_tool", i);
    if (startTag === -1) {
      // No more insert tags — append rest as visible text
      visibleText += raw.slice(i);
      break;
    }

    // Text before the tag
    visibleText += raw.slice(i, startTag);
    i = startTag;

    // Try to find the end of opening tag: line="N">
    const openEnd = raw.indexOf(">", i);
    if (openEnd === -1) {
      // Opening tag not yet complete — stop here (don't emit partial tag as visible)
      break;
    }

    // Extract line number
    const lineMatch = raw.slice(i, openEnd + 1).match(/line="(\d+)"/);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : 1;
    i = openEnd + 1;

    // Look for closing tag
    const closeTag = raw.indexOf("</insert_tool>", i);
    if (closeTag === -1) {
      // Still streaming the insert content — mark as pending
      const partialContent = raw.slice(i);
      insertions.push({ line, content: partialContent, pending: true });
      break;
    }

    // Complete insertion
    const content = raw.slice(i, closeTag).trim();
    insertions.push({ line, content, pending: false });
    i = closeTag + "</insert_tool>".length;
  }

  return { visibleText: visibleText.trim(), insertions };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AISidebarProps {
  noteContent: string;
  noteId: string | null;
  existingTags: string[];
  initialSummary?: string;
  autoValidationScore?: number | null;
  autoValidationResult?: {
    isValid: boolean;
    feedback: string;
    grammar_score: number;
  } | null;
  onSummaryGenerated: (summary: string) => void;
  onTagsSuggested: (tag: string) => void;
  onInsertLine?: (line: number, content: string) => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AISidebar({
  noteContent,
  noteId,
  existingTags,
  initialSummary,
  autoValidationScore,
  autoValidationResult,
  onSummaryGenerated,
  onTagsSuggested,
  onInsertLine,
  onClose,
}: AISidebarProps) {
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [validation, setValidation] = useState<AIValidation | null>(
    autoValidationResult ?? null
  );
  const [validationLoading, setValidationLoading] = useState(false);

  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);

  const [messages, setMessages] = useState<DisplayMessage[]>(() => loadHistory(noteId));
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [dismissedInserts, setDismissedInserts] = useState<Set<string>>(new Set());
  const [acceptedInserts, setAcceptedInserts] = useState<Set<string>>(new Set());

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Persist history whenever messages change (skip while streaming)
  useEffect(() => {
    if (!chatLoading) saveHistory(noteId, messages);
  }, [messages, chatLoading, noteId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Sync props
  useEffect(() => {
    if (autoValidationResult) setValidation(autoValidationResult);
  }, [autoValidationResult]);
  useEffect(() => { setSummary(initialSummary ?? ""); }, [initialSummary]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleGenerateSummary = async () => {
    if (!noteContent.trim()) { toast.error("Write some content first"); return; }
    setSummaryLoading(true);
    try {
      const next = (await generateSummaryWithPuter(noteContent)).trim();
      if (!next) throw new Error("AI returned an empty summary. Try again.");
      setSummary(next);
      onSummaryGenerated(next);
      toast.success("Summary generated!");
    } catch (err: any) { toast.error(err.message); }
    finally { setSummaryLoading(false); }
  };

  const handleValidateContent = async () => {
    if (!noteContent.trim()) { toast.error("Write some content first"); return; }
    setValidationLoading(true);
    try {
      const data = await validateWithPuter(noteContent);
      setValidation(data);
      data.isValid ? toast.success("Content looks great!") : toast.warning("Content needs some improvements");
    } catch (err: any) { toast.error(err.message); }
    finally { setValidationLoading(false); }
  };

  const handleSuggestTags = async () => {
    if (!noteContent.trim()) { toast.error("Write some content first"); return; }
    setTagsLoading(true);
    try {
      const tags = await suggestTagsWithPuter(noteContent, existingTags);
      setSuggestedTags(tags);
      toast.success("Tags suggested!");
    } catch (err: any) { toast.error(err.message); }
    finally { setTagsLoading(false); }
  };

  const handleClearHistory = useCallback(() => {
    setMessages([]);
    const key = STORAGE_KEY(noteId);
    if (key) localStorage.removeItem(key);
    toast.success("Chat history cleared");
  }, [noteId]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    // Build history for the API (only completed messages)
    const apiHistory: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? (m as AssistantMessage).content : (m as { role: "user"; content: string }).content,
    }));

    // Push user message + empty assistant placeholder
    const userMsg: DisplayMessage = { role: "user", content: userText };
    const assistantMsg: AssistantMessage = {
      role: "assistant",
      content: "",
      insertions: [],
      rawBuffer: "",
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      await chatWithPuterStream({
        message: userText,
        noteContent,
        history: apiHistory,
        onChunk: (chunk: string) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1] as AssistantMessage;
            if (last?.role !== "assistant") return prev;

            const newRaw = last.rawBuffer + chunk;
            const { visibleText, insertions } = parseStreamBuffer(newRaw);

            updated[updated.length - 1] = {
              ...last,
              rawBuffer: newRaw,
              content: visibleText,
              insertions,
            };
            return updated;
          });
        },
      });
    } catch (err: any) {
      toast.error(err.message);
      // Remove empty placeholder on error
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1] as AssistantMessage;
        if (last?.role === "assistant" && !last.content && last.insertions.length === 0) {
          updated.pop();
        }
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Assistant
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="grid grid-cols-4 m-2 shrink-0">
          <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
          <TabsTrigger value="validate" className="text-xs">Review</TabsTrigger>
          <TabsTrigger value="tags" className="text-xs">Tags</TabsTrigger>
          <TabsTrigger value="chat" className="text-xs">Chat</TabsTrigger>
        </TabsList>

        {/* ── Summary Tab ── */}
        <TabsContent value="summary" className="flex-1 p-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            Generate a 2-sentence summary for SEO and feed previews.
          </p>
          <Button onClick={handleGenerateSummary} disabled={summaryLoading} className="w-full gap-2">
            {summaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Summary
          </Button>
          {summary && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-muted rounded-lg">
              <p className="text-sm">{summary}</p>
            </motion.div>
          )}
        </TabsContent>

        {/* ── Validate Tab ── */}
        <TabsContent value="validate" className="flex-1 p-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            Check for grammar, clarity, logical issues, and toxicity.
          </p>
          <Button onClick={handleValidateContent} disabled={validationLoading} className="w-full gap-2">
            {validationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Validate Content
          </Button>
          {validation && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="flex items-center gap-2">
                {validation.isValid
                  ? <ThumbsUp className="h-5 w-5 text-green-500" />
                  : <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                <span className="font-medium">{validation.isValid ? "Content is valid" : "Needs improvement"}</span>
              </div>
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Quality Score</span>
                  <Badge variant={validation.grammar_score >= 8 ? "default" : validation.grammar_score >= 5 ? "secondary" : "destructive"}>
                    {validation.grammar_score}/10
                  </Badge>
                </div>
                <Separator />
                <p className="text-sm">{validation.feedback}</p>
              </div>
            </motion.div>
          )}
        </TabsContent>

        {/* ── Tags Tab ── */}
        <TabsContent value="tags" className="flex-1 p-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            Get AI-suggested tags based on your note content.
          </p>
          <Button onClick={handleSuggestTags} disabled={tagsLoading} className="w-full gap-2">
            {tagsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
            Suggest Tags
          </Button>
          {suggestedTags.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              <p className="text-sm text-muted-foreground">Click a tag to add it to your note:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => { onTagsSuggested(tag); setSuggestedTags((prev) => prev.filter((t) => t !== tag)); }}
                  >
                    + {tag}
                  </Badge>
                ))}
              </div>
            </motion.div>
          )}
        </TabsContent>

        {/* ── Chat Tab ── */}
        <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">
          <div className="px-3 py-2 border-b shrink-0 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Chat with AI about your note (history saved).</p>
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={handleClearHistory} title="Clear history">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0 p-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Ask a question about your note...
                </p>
              )}

              {messages.map((msg, i) => {
                if (msg.role === "user") {
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
                      <div className="max-w-[85%] p-3 rounded-lg text-sm bg-primary text-primary-foreground">
                        {msg.content}
                      </div>
                    </motion.div>
                  );
                }

                const aMsg = msg as AssistantMessage;
                const isStreamingThis = chatLoading && i === messages.length - 1;

                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-2">
                    {/* Bubble */}
                    {(aMsg.content || isStreamingThis) && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] p-3 rounded-lg text-sm bg-muted">
                          {aMsg.content ? (
                            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMd(aMsg.content)) }} />
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {isStreamingThis && aMsg.content && (
                            <span className="inline-block w-[2px] h-[1em] bg-foreground/70 align-middle ml-0.5 animate-pulse" />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Insert suggestions — shown as soon as detected, even while streaming */}
                    <AnimatePresence>
                      {aMsg.insertions.map((ins, j) => {
                        const key = `${i}-${j}`;
                        if (dismissedInserts.has(key)) return null;

                        return (
                          <motion.div
                            key={key}
                            initial={{ opacity: 0, y: 8, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.97 }}
                            className="border rounded-xl p-3 bg-primary/5 border-primary/20 text-sm space-y-2"
                          >
                            {/* Header */}
                            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                              <FilePen className="h-3.5 w-3.5 shrink-0" />
                              {ins.pending ? (
                                <span className="flex items-center gap-1">
                                  Inserting at paragraph {ins.line}
                                  <span className="flex gap-0.5 ml-1">
                                    <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                                    <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                                    <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                                  </span>
                                </span>
                              ) : (
                                <span>Insert at paragraph {ins.line}</span>
                              )}
                            </div>

                            {/* Preview */}
                            <p className={`text-xs border-l-2 border-primary/50 pl-2 italic text-muted-foreground leading-relaxed ${ins.pending ? "opacity-60" : ""}`}>
                              {ins.content || <span className="opacity-40">Generating...</span>}
                              {ins.pending && (
                                <span className="inline-block w-[2px] h-[0.9em] bg-primary/60 align-middle ml-0.5 animate-pulse" />
                              )}
                            </p>

                            {/* Actions — only when complete */}
                            {!ins.pending && (
                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs px-3 gap-1"
                                  disabled={acceptedInserts.has(key)}
                                  onClick={() => {
                                    onInsertLine?.(ins.line, ins.content);
                                    setAcceptedInserts((prev) => new Set([...prev, key]));
                                  }}
                                >
                                  {acceptedInserts.has(key) ? "✓ Inserted" : "Accept"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs px-3 text-muted-foreground"
                                  onClick={() => setDismissedInserts((prev) => new Set([...prev, key]))}
                                >
                                  Dismiss
                                </Button>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                );
              })}

              {/* Initial spinner — waiting for first chunk */}
              {chatLoading && messages[messages.length - 1]?.role === "assistant" &&
                (messages[messages.length - 1] as AssistantMessage).content === "" &&
                (messages[messages.length - 1] as AssistantMessage).insertions.length === 0 && (
                <div className="flex justify-start">
                  <div className="bg-muted p-3 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </ScrollArea>

          <form onSubmit={handleChatSubmit} className="p-3 border-t flex items-center gap-2 shrink-0">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about your note..."
              className="min-h-[40px] max-h-[100px] resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSubmit(e);
                }
              }}
            />
            <Button type="submit" size="icon" disabled={chatLoading || !chatInput.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
