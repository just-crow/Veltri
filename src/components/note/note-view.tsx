import { format } from "date-fns";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { NoteDownloadButton } from "./note-download-button";
import { ExpandableNoteContent } from "./expandable-note-content";
import { Star, ShieldCheck, FileText, ShieldAlert } from "lucide-react";
import type { Note, User, Tag } from "@/lib/types";

function inferFileType(note: Note): string {
  const mime = (note.original_file_type || "").toLowerCase();
  const fileName = (note.original_file_name || "").toLowerCase();
  if (mime.includes("pdf") || fileName.endsWith(".pdf")) return "PDF";
  if (mime.includes("word") || fileName.endsWith(".docx")) return "DOCX";
  if (mime.includes("markdown") || fileName.endsWith(".md")) return "MD";
  if (mime.includes("text") || fileName.endsWith(".txt")) return "TXT";
  if (fileName) return "FILE";
  return "NOTE";
}

function fileTypeBadgeClass(type: string): string {
  switch (type) {
    case "PDF":
      return "border-red-300/60 text-red-600 dark:border-red-400/40 dark:text-red-400";
    case "DOCX":
      return "border-blue-300/60 text-blue-600 dark:border-blue-400/40 dark:text-blue-400";
    default:
      return "";
  }
}

interface NoteViewProps {
  note: Note;
  author: User;
  tags: Tag[];
  originalFileUrl?: string | null;
  isExclusive?: boolean;
  isSold?: boolean;
}

export function NoteView({ note, author, tags, originalFileUrl, isExclusive = false, isSold = false }: NoteViewProps) {
  return (
    <article>
      {/* Header */}
      <header className="space-y-4 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-words">{note.title}</h1>
            {isExclusive && (
              <div>
                {isSold ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1 text-sm">
                    <ShieldCheck className="h-3.5 w-3.5" /> Exclusively Owned
                  </Badge>
                ) : (
                  <Badge className="bg-violet-600 hover:bg-violet-700 gap-1 text-sm">
                    <Star className="h-3.5 w-3.5" /> Exclusive — Full Rights
                  </Badge>
                )}
              </div>
            )}
          </div>
          <NoteDownloadButton
            fileUrl={originalFileUrl}
            fileName={note.original_file_name}
          />
        </div>

        {(note as any).description && (
          <p className="text-base text-foreground leading-relaxed">
            {(note as any).description}
          </p>
        )}

        {note.summary && note.summary !== (note as any).description && (
          <p className="text-sm text-muted-foreground italic">{note.summary}</p>
        )}

        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/u/${author.username}`} className="shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={author.avatar_url || ""} alt={author.username} />
              <AvatarFallback>
                {author.username?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/u/${author.username}`} className="font-medium hover:underline truncate block">
              {author.username}
            </Link>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {format(new Date(note.created_at), "MMMM d, yyyy")}
                {note.updated_at !== note.created_at &&
                  ` · Updated ${format(new Date(note.updated_at), "MMM d, yyyy")}`}
              </p>
              <Badge
                  variant="outline"
                  className={`text-[10px] uppercase tracking-wide gap-1 ${fileTypeBadgeClass(inferFileType(note))}`}
                >
                  <FileText className="h-3 w-3" />
                  {inferFileType(note)}
                </Badge>
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}

        <Separator />
      </header>

      {/* Content */}
      <ExpandableNoteContent html={note.content || ""} />

      {/* Originality disclaimer for exclusive notes */}
      {isExclusive && (
        <>
          <Separator className="mt-10 mb-6" />
          <div className="flex gap-3 rounded-lg border border-violet-300/40 bg-violet-50/50 dark:border-violet-500/20 dark:bg-violet-950/20 px-4 py-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-violet-500" />
            <p>
              The creator of this note has declared that its content is entirely original and has{" "}
              <strong className="text-foreground">not been published</strong> anywhere on the
              internet, nor submitted to any anti-plagiarism service (such as Turnitin or
              iThenticate) prior to listing here.
            </p>
          </div>
        </>
      )}
    </article>
  );
}
