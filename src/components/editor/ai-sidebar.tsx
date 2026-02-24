"use client";

import { useState, useRef, useEffect } from "react";
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
  MessageSquare,
  Loader2,
  Send,
  X,
  AlertTriangle,
  ThumbsUp,
} from "lucide-react";
import type { AIValidation, ChatMessage } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import DOMPurify from "isomorphic-dompurify";
import {
  chatWithPuterStream,
  generateSummaryWithPuter,
  suggestTagsWithPuter,
  validateWithPuter,
} from "@/lib/puter-browser";

interface InsertSuggestion {
  line: number;
  content: string;
}

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

function parseInsertTools(text: string): { cleanText: string; insertions: InsertSuggestion[] } {
  const insertions: InsertSuggestion[] = [];
  const cleanText = text
    .replace(/<insert_tool line="(\d+)">([\s\S]*?)<\/insert_tool>/g, (_full, lineStr, content) => {
      insertions.push({ line: parseInt(lineStr, 10), content: (content ?? "").trim() });
      return "";
    })
    .trim();
  return { cleanText, insertions };
}

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
    autoValidationResult
      ? {
          isValid: autoValidationResult.isValid,
          feedback: autoValidationResult.feedback,
          grammar_score: autoValidationResult.grammar_score,
        }
      : null
  );
  const [validationLoading, setValidationLoading] = useState(false);

  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [dismissedInserts, setDismissedInserts] = useState<Set<string>>(new Set());
  const [acceptedInserts, setAcceptedInserts] = useState<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sync auto-validation result into the Review tab when it arrives
  useEffect(() => {
    if (autoValidationResult) {
      setValidation({
        isValid: autoValidationResult.isValid,
        feedback: autoValidationResult.feedback,
        grammar_score: autoValidationResult.grammar_score,
      });
    }
  }, [autoValidationResult]);

  useEffect(() => {
    setSummary(initialSummary ?? "");
  }, [initialSummary]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleGenerateSummary = async () => {
    if (!noteContent.trim()) {
      toast.error("Write some content first");
      return;
    }

    setSummaryLoading(true);
    try {
      const nextSummary = (await generateSummaryWithPuter(noteContent)).trim();
      if (!nextSummary) {
        throw new Error("AI returned an empty summary. Try again.");
      }

      setSummary(nextSummary);
      onSummaryGenerated(nextSummary);
      toast.success("Summary generated!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleValidateContent = async () => {
    if (!noteContent.trim()) {
      toast.error("Write some content first");
      return;
    }

    setValidationLoading(true);
    try {
      const data = await validateWithPuter(noteContent);

      setValidation(data);
      if (data.isValid) {
        toast.success("Content looks great!");
      } else {
        toast.warning("Content needs some improvements");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setValidationLoading(false);
    }
  };

  const handleSuggestTags = async () => {
    if (!noteContent.trim()) {
      toast.error("Write some content first");
      return;
    }

    setTagsLoading(true);
    try {
      const tags = await suggestTagsWithPuter(noteContent, existingTags);

      setSuggestedTags(tags);
      toast.success("Tags suggested!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTagsLoading(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMessage: ChatMessage = { role: "user", content: chatInput };
    const history = [...chatMessages];
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setChatLoading(true);

    // Add an empty assistant message that we'll fill with streamed chunks
    setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await chatWithPuterStream({
        message: chatInput,
        noteContent,
        history,
        onChunk: (chunk) => {
          setChatMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + chunk,
              };
            }
            return updated;
          });
        },
      });
    } catch (err: any) {
      toast.error(err.message);
      // Remove the empty placeholder on error
      setChatMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.role === "assistant" && !updated[updated.length - 1].content) {
          updated.pop();
        }
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Assistant
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="summary" className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-4 m-2">
          <TabsTrigger value="summary" className="text-xs">
            Summary
          </TabsTrigger>
          <TabsTrigger value="validate" className="text-xs">
            Review
          </TabsTrigger>
          <TabsTrigger value="tags" className="text-xs">
            Tags
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-xs">
            Chat
          </TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="flex-1 p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate a 2-sentence summary for SEO and feed previews.
          </p>
          <Button
            onClick={handleGenerateSummary}
            disabled={summaryLoading}
            className="w-full gap-2"
          >
            {summaryLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Summary
          </Button>
          {summary && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-muted rounded-lg"
            >
              <p className="text-sm">{summary}</p>
            </motion.div>
          )}
        </TabsContent>

        {/* Validate Tab */}
        <TabsContent value="validate" className="flex-1 p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Check for grammar, clarity, logical issues, and toxicity.
          </p>
          <Button
            onClick={handleValidateContent}
            disabled={validationLoading}
            className="w-full gap-2"
          >
            {validationLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Validate Content
          </Button>
          {validation && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2">
                {validation.isValid ? (
                  <ThumbsUp className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
                <span className="font-medium">
                  {validation.isValid ? "Content is valid" : "Needs improvement"}
                </span>
              </div>
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Quality Score</span>
                  <Badge
                    variant={
                      validation.grammar_score >= 8
                        ? "default"
                        : validation.grammar_score >= 5
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {validation.grammar_score}/10
                  </Badge>
                </div>
                <Separator />
                <p className="text-sm">{validation.feedback}</p>
              </div>
            </motion.div>
          )}
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="flex-1 p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Get AI-suggested tags based on your note content.
          </p>
          <Button
            onClick={handleSuggestTags}
            disabled={tagsLoading}
            className="w-full gap-2"
          >
            {tagsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Tags className="h-4 w-4" />
            )}
            Suggest Tags
          </Button>
          {suggestedTags.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <p className="text-sm text-muted-foreground">
                Click a tag to add it to your note:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => {
                      onTagsSuggested(tag);
                      setSuggestedTags((prev) => prev.filter((t) => t !== tag));
                    }}
                  >
                    + {tag}
                  </Badge>
                ))}
              </div>
            </motion.div>
          )}
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent
          value="chat"
          className="flex-1 flex flex-col overflow-hidden p-0"
        >
          <div className="p-3 border-b">
            <p className="text-xs text-muted-foreground">
              Chat with AI about your note content (RAG).
            </p>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {chatMessages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Ask a question about your note...
                </p>
              )}
              {chatMessages.map((msg, i) => {
                if (msg.role === "user") {
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex justify-end"
                    >
                      <div className="max-w-[85%] p-3 rounded-lg text-sm bg-primary text-primary-foreground">
                        {msg.content}
                      </div>
                    </motion.div>
                  );
                }

                const { cleanText, insertions } = parseInsertTools(msg.content);
                const isStreaming = chatLoading && i === chatMessages.length - 1 && msg.content !== "";
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex justify-start">
                      <div className="max-w-[85%] p-3 rounded-lg text-sm bg-muted">
                        <div
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMd(cleanText || msg.content)) }}
                        />
                        {isStreaming && (
                          <span className="inline-block w-[2px] h-[1em] bg-foreground/70 align-middle ml-0.5 animate-pulse" />
                        )}
                      </div>
                    </div>
                    <AnimatePresence>
                      {insertions.map((ins, j) => {
                        const key = `${i}-${j}`;
                        if (dismissedInserts.has(key)) return null;
                        return (
                          <motion.div
                            key={key}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="border rounded-lg p-3 bg-muted/50 text-sm space-y-2"
                          >
                            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                              <Sparkles className="h-3 w-3" />
                              Insert suggestion at paragraph {ins.line}
                            </div>
                            <p className="text-xs border-l-2 border-primary pl-2 italic">{ins.content}</p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-6 text-xs px-2"
                                disabled={acceptedInserts.has(key)}
                                onClick={() => {
                                  onInsertLine?.(ins.line, ins.content);
                                  setAcceptedInserts((prev) => new Set([...prev, key]));
                                }}
                              >
                                {acceptedInserts.has(key) ? "Inserted ✓" : "Insert"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs px-2"
                                onClick={() => setDismissedInserts((prev) => new Set([...prev, key]))}
                              >
                                Ignore
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
              {/* Show spinner only while waiting for first streaming chunk */}
              {chatLoading && chatMessages[chatMessages.length - 1]?.content === "" && (
                <div className="flex justify-start">
                  <div className="bg-muted p-3 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
          <form
            onSubmit={handleChatSubmit}
            className="p-3 border-t flex items-center gap-2"
          >
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
            <Button
              type="submit"
              size="icon"
              disabled={chatLoading || !chatInput.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
