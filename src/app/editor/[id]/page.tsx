"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TipTapEditor from "@/components/editor/tiptap-editor";
import type { TipTapEditorRef } from "@/components/editor/tiptap-editor";
import { AISidebar } from "@/components/editor/ai-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import slugify from "slugify";
import {
  Save,
  Globe,
  GlobeLock,
  Loader2,
  Sparkles,
  X,
  PanelRightOpen,
  PanelRightClose,
  Upload,
  Download,
  DollarSign,
  Info,
  ChevronsUpDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Note, Tag } from "@/lib/types";
import { validateWithPuter } from "@/lib/nvidia-browser";

type PublishDetectionResult = {
  model: string;
  label: string;
  score: number;
  isLikelyAI: boolean;
  summary: string;
  checkedAt: string;
};

const SPECIAL_TAGS = [
  "ai-generated",
  "human-generated",
  "ai-assisted",
  "human-written",
  "machine-generated",
  "original-content",
];

const BUILT_IN_TAGS = [
  "study-notes",
  "math",
  "science",
  "biology",
  "chemistry",
  "physics",
  "history",
  "geography",
  "english",
  "literature",
  "programming",
  "javascript",
  "typescript",
  "react",
  "nextjs",
  "algorithms",
  "data-structures",
  "economics",
  "finance",
  "business",
  "exam-prep",
  "beginner",
  "intermediate",
  "advanced",
  ...SPECIAL_TAGS,
];

export default function NoteEditorPage() {
  const ORIGINAL_FILE_BUCKET = "note-images";
  const ORIGINAL_FILE_PREFIX = "original-files";

  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;
  const isNew = noteId === "new";

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [rawMarkdown, setRawMarkdown] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [detectingAi, setDetectingAi] = useState(false);
  const [validationScore, setValidationScore] = useState<number | null>(null);
  const [validationFeedback, setValidationFeedback] = useState<string | null>(null);
  const [publishAiDetection, setPublishAiDetection] = useState<PublishDetectionResult | null>(null);
  const [autoValidationResult, setAutoValidationResult] = useState<{
    isValid: boolean;
    feedback: string;
    grammar_score: number;
  } | null>(null);
  const [price, setPrice] = useState<number>(0);
  const [isExclusive, setIsExclusive] = useState(false);
  const [showExclusiveDialog, setShowExclusiveDialog] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [showAISidebar, setShowAISidebar] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(
    isNew ? null : noteId
  );

  const supabase = createClient();

  const editorRef = useRef<TipTapEditorRef>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  // Revoke blob URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (uploadedFileUrl?.startsWith("blob:")) URL.revokeObjectURL(uploadedFileUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFileUrl]);

  useEffect(() => {
    const loadAvailableTags = async () => {
      const { data } = await (supabase as any)
        .from("tags")
        .select("*")
        .order("name", { ascending: true })
        .limit(200);

      if (data) {
        setAvailableTags(data as Tag[]);
      }
    };

    loadAvailableTags();
  }, [supabase]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleViewportChange = () => setIsMobileViewport(mediaQuery.matches);

    handleViewportChange();
    mediaQuery.addEventListener("change", handleViewportChange);

    return () => {
      mediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);

  const uploadOriginalFile = async (file: File) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("You must be logged in to upload files");
      return null;
    }

    const safeName = file.name.replace(/[^\w.\- ]/g, "_");
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}-${safeName}`;
    const filePath = `${ORIGINAL_FILE_PREFIX}/${user.id}/${fileName}`;

    const { error } = await supabase.storage
      .from(ORIGINAL_FILE_BUCKET)
      .upload(filePath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (error) {
      toast.error("Failed to upload original file");
      return null;
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(ORIGINAL_FILE_BUCKET)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (signedUrlError || !signedUrlData?.signedUrl) {
      toast.error("Failed to generate file URL");
      return null;
    }

    return {
      filePath,
      publicUrl: signedUrlData.signedUrl,
      fileName: file.name,
      fileType: file.type || null,
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    const needsServerParse = name.endsWith(".pdf") || name.endsWith(".docx");

    if (needsServerParse) {
      const formData = new FormData();
      formData.append("file", file);
      toast.info("Parsing file...");
      try {
        const res = await fetch("/api/parse-file", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Parse failed");
        editorRef.current?.setFileContent(data.html);
        if (!title && file.name) setTitle(file.name.replace(/\.[^.]+$/, ""));
        const uploaded = await uploadOriginalFile(file);
        if (uploaded) {
          if (uploadedFileUrl?.startsWith("blob:")) URL.revokeObjectURL(uploadedFileUrl);
          setUploadedFileUrl(uploaded.publicUrl);
          setUploadedFileName(uploaded.fileName);
          setUploadedFilePath(uploaded.filePath);
          setUploadedFileType(uploaded.fileType);
        }
        toast.success("File loaded!");
      } catch (err: any) {
        toast.error(err.message);
      }
    } else {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target?.result as string;
        const isMarkdown = name.endsWith(".md");
        if (isMarkdown) {
          const lines = text.split("\n");
          const result: string[] = [];
          let inCode = false, codeBuf = "", codeLang = "";
          const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/`(.+?)`/g, "<code>$1</code>");
          for (const raw of lines) {
            if (raw.startsWith("```")) { if (!inCode) { inCode = true; codeLang = raw.slice(3).trim() || "text"; codeBuf = ""; } else { result.push(`<pre><code class="language-${codeLang}">${esc(codeBuf.trimEnd())}</code></pre>`); inCode = false; } continue; }
            if (inCode) { codeBuf += raw + "\n"; continue; }
            if (/^### /.test(raw)) { result.push(`<h3>${inline(raw.slice(4))}</h3>`); continue; }
            if (/^## /.test(raw)) { result.push(`<h2>${inline(raw.slice(3))}</h2>`); continue; }
            if (/^# /.test(raw)) { result.push(`<h1>${inline(raw.slice(2))}</h1>`); continue; }
            if (/^[-*] /.test(raw)) { result.push(`<ul><li>${inline(raw.slice(2))}</li></ul>`); continue; }
            result.push(raw.trim() === "" ? "<p></p>" : `<p>${inline(raw)}</p>`);
          }
          editorRef.current?.setFileContent(result.join(""));
        } else {
          const html = text.split("\n").map((l) => l.trim() === "" ? "<p></p>" : `<p>${l}</p>`).join("");
          editorRef.current?.setFileContent(html);
        }
        if (!title && file.name) setTitle(file.name.replace(/\.[^.]+$/, ""));
        const uploaded = await uploadOriginalFile(file);
        if (uploaded) {
          if (uploadedFileUrl?.startsWith("blob:")) URL.revokeObjectURL(uploadedFileUrl);
          setUploadedFileUrl(uploaded.publicUrl);
          setUploadedFileName(uploaded.fileName);
          setUploadedFilePath(uploaded.filePath);
          setUploadedFileType(uploaded.fileType);
        }
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleInsertLine = (line: number, content: string) => {
    editorRef.current?.insertAtLine(line, content);
  };

  // Load existing note
  useEffect(() => {
    if (isNew) return;

    const loadNote = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        toast.error("You must be logged in");
        router.push("/login");
        return;
      }

      const { data, error } = await (supabase as any)
        .from("notes")
        .select("*")
        .eq("id", noteId)
        .eq("user_id", currentUser.id)
        .single();

      const note = data as Note | null;

      if (error || !note) {
        toast.error("Note not found");
        router.push("/dashboard");
        return;
      }

      setTitle(note.title);
      setContent(note.content ?? "");
      setRawMarkdown(note.raw_markdown ?? "");
      setIsPublished(note.is_published);
      setDescription((note as any).description ?? note.summary ?? "");
      setValidationScore(note.validation_score ?? null);
      setValidationFeedback((note as any).validation_feedback ?? null);
      const detectionSummary = (note as any).ai_detection_summary as string | null;
      const detectionLabel = (note as any).ai_detection_label as string | null;
      const detectionScore = (note as any).ai_detection_score as number | null;
      const detectionFlag = (note as any).ai_detection_is_likely_ai as boolean | null;
      const detectionCheckedAt = (note as any).ai_detection_checked_at as string | null;
      if (detectionSummary && detectionLabel && detectionCheckedAt && detectionScore != null && detectionFlag != null) {
        setPublishAiDetection({
          model: "fakespot-ai/roberta-base-ai-text-detection-v1",
          label: detectionLabel,
          score: Number(detectionScore),
          isLikelyAI: Boolean(detectionFlag),
          summary: detectionSummary,
          checkedAt: detectionCheckedAt,
        });
      } else {
        setPublishAiDetection(null);
      }
      setPrice(Number(note.price) || 0);
      setIsExclusive(!!(note as any).is_exclusive);
      setUploadedFileName((note as any).original_file_name ?? null);
      setUploadedFilePath((note as any).original_file_path ?? null);
      setUploadedFileType((note as any).original_file_type ?? null);

      const existingFilePath = (note as any).original_file_path as string | null;
      if (existingFilePath) {
        const { data: signedData } = await supabase.storage
          .from(ORIGINAL_FILE_BUCKET)
          .createSignedUrl(existingFilePath, 3600);
        setUploadedFileUrl(signedData?.signedUrl ?? null);
      } else {
        setUploadedFileUrl(null);
      }

      // Load tags
      const { data: noteTags } = await (supabase as any)
        .from("note_tags")
        .select("tag_id, tags(*)")
        .eq("note_id", noteId);

      if (noteTags) {
        const tagsList = noteTags
          .map((nt: any) => nt.tags)
          .filter(Boolean) as Tag[];
        setTags(tagsList);
      }

      setLoading(false);
    };

    loadNote();
  }, [noteId, isNew, router, supabase]);

  const handleContentChange = useCallback((html: string, text: string) => {
    setContent(html);
    setRawMarkdown(text);
  }, []);

  const handleSave = async (publishOverride?: boolean) => {
    if (!title.trim()) {
      toast.error("Please add a title");
      return;
    }

    // Validate price
    const MAX_PRICE = 999.99;
    if (price < 0 || price > MAX_PRICE) {
      toast.error(`Price must be between $0 and $${MAX_PRICE}`);
      return;
    }
    const sanitizedPrice = Math.round(Math.max(0, Math.min(price, MAX_PRICE)) * 100) / 100;

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("You must be logged in");
      setSaving(false);
      return;
    }

    const slug = slugify(title, { lower: true, strict: true });
    const nextIsPublished = publishOverride ?? isPublished;

    // Auto-validate when publishing
    const shouldValidate = nextIsPublished && rawMarkdown.trim().length > 20;
    let nextValidationScore: number | null = nextIsPublished
      ? validationScore
      : null;
    let nextValidationFeedback: string | null = nextIsPublished
      ? validationFeedback
      : null;

    if (shouldValidate) {
      setValidating(true);
      try {
        const valData = await validateWithPuter(rawMarkdown);
        if (valData.grammar_score) {
          nextValidationScore = valData.grammar_score;
          nextValidationFeedback = valData.feedback ?? null;
          setValidationFeedback(nextValidationFeedback);
          setAutoValidationResult({
            isValid: valData.isValid,
            feedback: valData.feedback,
            grammar_score: valData.grammar_score,
          });
          const emoji = valData.isValid ? "✓" : "!";
          toast.success(
            `${emoji} Quality: ${valData.grammar_score}/10 — ${valData.feedback?.substring(0, 100)}...`
          );
        }
      } catch (err) {
        console.error("Validation error:", err);
        toast.error("Failed to validate note quality");
      } finally {
        setValidating(false);
      }
    }

    // AI detection when publishing
    let nextAiDetection = publishAiDetection;
    const shouldDetectAi = nextIsPublished && rawMarkdown.trim().length >= 40;
    if (shouldDetectAi) {
      setDetectingAi(true);
      try {
        const res = await fetch("/api/ai/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: rawMarkdown }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "AI detection failed");
        }

        nextAiDetection = {
          model: data.model,
          label: data.label,
          score: Number(data.score),
          isLikelyAI: Boolean(data.isLikelyAI),
          summary: String(data.summary),
          checkedAt: new Date().toISOString(),
        };
        setPublishAiDetection(nextAiDetection);
        toast.success(`AI detection: ${nextAiDetection.summary}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Detection failed";
        toast.error(`AI detection failed: ${message}`);
      } finally {
        setDetectingAi(false);
      }
    } else if (!nextIsPublished) {
      nextAiDetection = null;
      setPublishAiDetection(null);
    }

    if (currentNoteId) {
      // Update existing note
      const { error } = await (supabase as any)
        .from("notes")
        .update({
          title,
          content,
          raw_markdown: rawMarkdown,
          slug,
          is_published: nextIsPublished,
          summary: description.trim() || null,
          validation_score: nextValidationScore,
          validation_feedback: nextValidationScore ? (nextValidationFeedback || null) : null,
          ai_detection_label: nextAiDetection?.label ?? null,
          ai_detection_score: nextAiDetection?.score ?? null,
          ai_detection_is_likely_ai: nextAiDetection?.isLikelyAI ?? null,
          ai_detection_summary: nextAiDetection?.summary ?? null,
          ai_detection_checked_at: nextAiDetection?.checkedAt ?? null,
          original_file_name: uploadedFileName || null,
          original_file_path: uploadedFilePath || null,
          original_file_type: uploadedFileType || null,
          price: sanitizedPrice,
          is_exclusive: isExclusive,
          description: description.trim() || null,
        })
        .eq("id", currentNoteId);

      if (error) {
        toast.error("Failed to save: " + error.message);
        setSaving(false);
        return;
      }

      toast.success("Note saved!");
      setValidationScore(nextValidationScore);
      setValidationFeedback(nextValidationFeedback);
      setIsPublished(nextIsPublished);
    } else {
      // Create new note
      const { data, error } = await (supabase as any)
        .from("notes")
        .insert({
          user_id: user.id,
          title,
          content,
          raw_markdown: rawMarkdown,
          slug,
          is_published: nextIsPublished,
          summary: description.trim() || null,
          validation_score: nextValidationScore,
          validation_feedback: nextValidationScore ? (nextValidationFeedback || null) : null,
          ai_detection_label: nextAiDetection?.label ?? null,
          ai_detection_score: nextAiDetection?.score ?? null,
          ai_detection_is_likely_ai: nextAiDetection?.isLikelyAI ?? null,
          ai_detection_summary: nextAiDetection?.summary ?? null,
          ai_detection_checked_at: nextAiDetection?.checkedAt ?? null,
          original_file_name: uploadedFileName || null,
          original_file_path: uploadedFilePath || null,
          original_file_type: uploadedFileType || null,
          price: sanitizedPrice,
          is_exclusive: isExclusive,
          description: description.trim() || null,
        })
        .select()
        .single();

      if (error) {
        toast.error("Failed to create: " + error.message);
        setSaving(false);
        return;
      }

      const newNote = data as Note;
      setCurrentNoteId(newNote.id);
      setValidationScore(nextValidationScore);
      setValidationFeedback(nextValidationFeedback);
      setIsPublished(nextIsPublished);
      router.replace(`/editor/${newNote.id}`);
      toast.success("Note created!");
    }

    setSaving(false);
  };

  const handleAddTag = async (tagName: string) => {
    const normalizedTagName = tagName.trim();
    if (!currentNoteId) {
      toast.error("Save the note first before adding tags");
      return false;
    }

    if (!normalizedTagName) {
      toast.error("Tag name cannot be empty");
      return false;
    }

    const tagSlug = slugify(normalizedTagName, { lower: true, strict: true });

    // Upsert the tag
    const { data: existingTagData } = await (supabase as any)
      .from("tags")
      .select("*")
      .eq("slug", tagSlug)
      .single();

    let tag = existingTagData as Tag | null;

    if (!tag) {
      const { data: newTagData, error } = await (supabase as any)
        .from("tags")
        .insert({ name: normalizedTagName, slug: tagSlug })
        .select()
        .single();

      if (error) {
        toast.error("Failed to create tag");
        return false;
      }
      tag = newTagData as Tag;
    }

    // Check if tag already associated
    if (tags.find((t) => t.id === tag!.id)) {
      toast.info("Tag already added");
      return false;
    }

    // Associate with note
    const { error } = await (supabase as any)
      .from("note_tags")
      .insert({ note_id: currentNoteId, tag_id: tag.id });

    if (error) {
      toast.error("Failed to add tag");
      return false;
    }

    setTags((prev) => [...prev, tag!]);
    setAvailableTags((prev) =>
      prev.some((t) => t.id === tag!.id) ? prev : [...prev, tag!]
    );
    toast.success(`Tag "${normalizedTagName}" added`);
    return true;
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!currentNoteId) return;

    const { error } = await (supabase as any)
      .from("note_tags")
      .delete()
      .eq("note_id", currentNoteId)
      .eq("tag_id", tagId);

    if (error) {
      toast.error("Failed to remove tag");
      return;
    }

    setTags((prev) => prev.filter((t) => t.id !== tagId));
    toast.success("Tag removed");
  };

  const selectableTagNames = Array.from(
    new Set([
      ...BUILT_IN_TAGS,
      ...availableTags.map((tag) => tag.name),
    ])
  ).filter(
    (tagName) =>
      !tags.some((selectedTag) => selectedTag.name.toLowerCase() === tagName.toLowerCase())
  );

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 overflow-x-hidden">
      <div
        className={`flex-1 min-w-0 overflow-x-hidden transition-all duration-300 ${showAISidebar ? "md:mr-96" : ""}`}
      >
        <div className="container mx-auto max-w-4xl px-4 py-4 md:py-8 space-y-4 md:space-y-6">
          {/* Header Controls - responsive layout */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
            {/* Row 1: Publish toggle + Price (always visible) */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="publish"
                  checked={isPublished}
                  onCheckedChange={(checked) => {
                    setIsPublished(checked);
                    void handleSave(checked);
                  }}
                  disabled={saving || validating}
                />
                <Label htmlFor="publish" className="flex items-center gap-1">
                  {isPublished ? (
                    <>
                      <Globe className="h-4 w-4 text-green-600" /> Published
                    </>
                  ) : (
                    <>
                      <GlobeLock className="h-4 w-4 text-muted-foreground" />{" "}
                      Draft
                    </>
                  )}
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  max="999.99"
                  step="0.01"
                  placeholder="0.00"
                  value={price || ""}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  className="w-24 h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">
                  {price > 0 ? "Paid" : "Free"}
                </span>
              </div>
              {price > 0 && (
                <TooltipProvider delayDuration={200}>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      id="exclusive"
                      checked={isExclusive}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setShowExclusiveDialog(true);
                        } else {
                          setIsExclusive(false);
                        }
                      }}
                      disabled={saving}
                    />
                    <Label htmlFor="exclusive" className="text-xs cursor-pointer">
                      Exclusive rights
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-64 text-xs">
                        <p>
                          <strong>Exclusive rights</strong> means this note can only be purchased once.
                          The buyer receives full ownership — the note is removed from sale immediately after purchase and marked as sold.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              )}
            </div>

            {/* Row 2: Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileUploadRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Upload</span>
              </Button>
              {uploadedFileUrl && uploadedFileName && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="gap-2 max-w-40 truncate"
                >
                  <a href={uploadedFileUrl} download={uploadedFileName}>
                    <Download className="h-4 w-4 shrink-0" />
                    <span className="truncate">{uploadedFileName}</span>
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAISidebar(!showAISidebar)}
                className="gap-2"
              >
                {showAISidebar ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
                <Sparkles className="h-4 w-4" />
                AI
              </Button>
              <Button
                onClick={() => void handleSave()}
                disabled={saving || validating || detectingAi}
                size="sm"
                className="gap-2"
              >
                {detectingAi ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Detecting AI</span>
                  </>
                ) : validating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Validating</span>
                  </>
                ) : saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Saving</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>

          {publishAiDetection && isPublished && (
            <div className="rounded-md border px-3 py-2 text-sm bg-muted/40">
              <span className="font-medium">AI detection on publish:</span>{" "}
              {publishAiDetection.summary}
            </div>
          )}

          {/* Title Input */}
          <Input
            placeholder="Note title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-3xl font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />

          {/* Description */}
          <Textarea
            placeholder="Short description — tell buyers what they'll learn from this note (shown on the purchase page)..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={400}
            rows={3}
            className="resize-none text-sm border-none shadow-none px-0 focus-visible:ring-0 placeholder:text-muted-foreground/40"
          />

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={tagPopoverOpen}
                    className="h-8 flex-1 justify-between text-muted-foreground font-normal"
                  >
                    Add a tag...
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search tags..." />
                    <CommandList>
                      <CommandEmpty>
                        <button
                          className="w-full text-left px-2 py-1 text-sm hover:underline"
                          onClick={() => {
                            const input = document.querySelector<HTMLInputElement>('[cmdk-input]');
                            const val = input?.value?.trim();
                            if (val) {
                              void (async () => {
                                const added = await handleAddTag(val);
                                if (added) {
                                  if (input) input.value = "";
                                  setTagPopoverOpen(false);
                                }
                              })();
                            }
                          }}
                        >
                          Create custom tag
                        </button>
                      </CommandEmpty>
                      {selectableTagNames.filter(n => SPECIAL_TAGS.includes(n)).length > 0 && (
                        <CommandGroup heading="Authorship">
                          {selectableTagNames
                            .filter((n) => SPECIAL_TAGS.includes(n))
                            .map((tagName) => (
                              <CommandItem
                                key={tagName}
                                value={tagName}
                                onSelect={() => {
                                  void (async () => {
                                    await handleAddTag(tagName);
                                    setTagPopoverOpen(false);
                                  })();
                                }}
                              >
                                {tagName}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      )}
                      <CommandGroup heading="Topics">
                        {selectableTagNames
                          .filter((n) => !SPECIAL_TAGS.includes(n))
                          .map((tagName) => (
                            <CommandItem
                              key={tagName}
                              value={tagName}
                              onSelect={() => {
                                void (async () => {
                                  await handleAddTag(tagName);
                                  setTagPopoverOpen(false);
                                })();
                              }}
                            >
                              {tagName}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="gap-1 cursor-pointer"
              >
                {tag.name}
                <button
                  type="button"
                  className="inline-flex items-center justify-center"
                  onClick={() => {
                    void handleRemoveTag(tag.id);
                  }}
                  aria-label={`Remove ${tag.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            </div>
          </div>

          {/* Editor */}
          <TipTapEditor ref={editorRef} content={content} onChange={handleContentChange} />
        </div>
      </div>

      {/* Hidden file input for note upload */}
      <input
        ref={fileUploadRef}
        type="file"
        accept=".md,.txt,.pdf,.docx"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* AI Sidebar - Sheet on mobile, fixed panel on desktop */}
      {/* Mobile: Sheet overlay */}
      {isMobileViewport && (
        <Sheet open={showAISidebar} onOpenChange={setShowAISidebar}>
          <SheetContent side="right" className="w-full sm:w-96 p-0 md:hidden" overlayClassName="md:hidden" showCloseButton={false}>
            <SheetTitle className="sr-only">AI Assistant</SheetTitle>
            <SheetDescription className="sr-only">AI assistant panel for note editing</SheetDescription>
            <AISidebar
              noteContent={rawMarkdown || content}
              noteId={currentNoteId}
              existingTags={tags.map((tag) => tag.name)}
              initialSummary={description}
              autoValidationScore={validationScore}
              autoValidationResult={autoValidationResult}
              onSummaryGenerated={setDescription}
              onTagsSuggested={handleAddTag}
              onInsertLine={handleInsertLine}
              onClose={() => setShowAISidebar(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Desktop: Fixed side panel */}
      <AnimatePresence>
        {showAISidebar && !isMobileViewport && (
          <motion.div
            initial={{ x: 384 }}
            animate={{ x: 0 }}
            exit={{ x: 384 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-16 bottom-0 w-96 border-l bg-background overflow-y-auto hidden md:block z-40"
          >
            <AISidebar
              noteContent={rawMarkdown || content}
              noteId={currentNoteId}
              existingTags={tags.map((tag) => tag.name)}
              initialSummary={description}
              autoValidationScore={validationScore}
              autoValidationResult={autoValidationResult}
              onSummaryGenerated={setDescription}
              onTagsSuggested={handleAddTag}
              onInsertLine={handleInsertLine}
              onClose={() => setShowAISidebar(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exclusive rights pledge dialog */}
      <Dialog open={showExclusiveDialog} onOpenChange={setShowExclusiveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exclusive Rights Declaration</DialogTitle>
            <DialogDescription>
              Before enabling exclusive rights, please read and agree to the following.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>By enabling <strong className="text-foreground">Exclusive Rights</strong>, you declare that:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>The content is entirely your own original work.</li>
              <li>It has <strong className="text-foreground">not been published</strong> anywhere online — including personal sites, social media, blogs, or file-sharing platforms.</li>
              <li>It has <strong className="text-foreground">not been submitted</strong> to any anti-plagiarism service such as Turnitin, iThenticate, Copyscape, or similar tools.</li>
              <li>You have the full legal right to transfer ownership of this content.</li>
            </ul>
            <p className="text-destructive font-medium">
              Violations may result in a permanent ban and potential legal liability.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowExclusiveDialog(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700"
              onClick={() => {
                setIsExclusive(true);
                setShowExclusiveDialog(false);
              }}
            >
              I agree — enable exclusive rights
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
