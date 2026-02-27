import { format } from "date-fns";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { NoteDownloadButton } from "./note-download-button";
import { ExpandableNoteContent } from "./expandable-note-content";
import { FileViewer } from "./file-viewer";
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
      {(() => {
        const fileType = inferFileType(note);
        const hasViewer = (fileType === "PDF" || fileType === "DOCX") && originalFileUrl;

        return (
          <div className="space-y-8">
            {hasViewer && (
              <FileViewer
                fileUrl={originalFileUrl!}
                fileType={fileType as "PDF" | "DOCX"}
              />
            )}

            {hasViewer ? (
              <details className="group border border-border rounded-lg bg-muted/10 overflow-hidden shadow-sm">
                <summary className="font-medium cursor-pointer p-4 hover:bg-muted/30 transition-colors flex items-center justify-between text-muted-foreground select-none">
                  <span className="flex items-center gap-3">
                    <FileText className="h-4 w-4" />
                    View extracted text
                    <span className="text-[10px] uppercase tracking-wider font-semibold border px-2 py-0.5 rounded-full bg-background/50 text-muted-foreground/80">Lossy</span>
                  </span>
                  <span className="text-xl font-light leading-none group-open:-rotate-180 transition-transform duration-300">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-muted-foreground"><path d="M3.13523 6.15803C3.3241 5.95657 3.64052 5.94637 3.84197 6.13523L7.5 9.56464L11.158 6.13523C11.3595 5.94637 11.6759 5.95657 11.8648 6.15803C12.0536 6.35949 12.0434 6.67591 11.842 6.86477L7.84197 10.6148C7.64964 10.7951 7.35036 10.7951 7.15803 10.6148L3.15803 6.86477C2.95657 6.67591 2.94637 6.35949 3.13523 6.15803Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                  </span>
                </summary>
                <div className="p-4 pt-4 border-t border-border/50 bg-background/50">
                  <ExpandableNoteContent html={note.content || ""} />
                </div>
              </details>
            ) : (
              <ExpandableNoteContent html={note.content || ""} />
            )}
          </div>
        );
      })()}

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
