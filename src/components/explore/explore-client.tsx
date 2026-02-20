"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Search, Globe } from "lucide-react";
import { motion } from "framer-motion";
import type { Note, User } from "@/lib/types";
import { NoteScoreBadge } from "@/components/note/note-score-badge";
import { NotePriceBadge } from "@/components/note/note-price-badge";

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

interface ExploreClientProps {
  initialNotes: (Note & { users: User })[];
  initialQuery: string;
  totalCount: number;
  currentPage: number;
  perPage: number;
}

export function ExploreClient({
  initialNotes,
  initialQuery,
  totalCount,
  currentPage,
  perPage,
}: ExploreClientProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const router = useRouter();
  const totalPages = Math.ceil(totalCount / perPage);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    router.push(`/explore?${params.toString()}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Explore Notes</h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Discover ideas and knowledge shared by the community.
        </p>

        <form
          onSubmit={handleSearch}
          className="flex gap-2 max-w-lg mx-auto"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </div>

      {initialQuery && (
        <p className="text-sm text-muted-foreground">
          {totalCount} result{totalCount !== 1 ? "s" : ""} for &quot;
          {initialQuery}&quot;
        </p>
      )}

      {initialNotes.length === 0 ? (
        <div className="text-center py-16">
          <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">No notes found</h3>
          <p className="text-muted-foreground">
            {initialQuery
              ? "Try a different search term"
              : "No published notes yet. Be the first to publish!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {initialNotes.map((note, i) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, type: "spring", stiffness: 260, damping: 20 }}
              whileHover={{ y: -4, transition: { duration: 0.18 } }}
            >
              <Link href={`/note/${note.users?.username}/${note.slug}`}>
                <Card className="h-full hover:shadow-xl transition-shadow cursor-pointer group">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="min-w-0 overflow-hidden group-hover:text-primary transition-colors">
                        <span className="block line-clamp-2 break-words" title={note.title}>{note.title}</span>
                      </CardTitle>
                      <div className="shrink-0">
                        <NotePriceBadge price={note.price} isExclusive={note.is_exclusive} isSold={note.is_sold} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <CardDescription className="shrink-0">
                        {format(new Date(note.created_at), "MMM d, yyyy")}
                      </CardDescription>
                      <Badge variant="outline" className={`shrink-0 text-[10px] uppercase tracking-wide ${fileTypeBadgeClass(inferFileType(note))}`}>
                        {inferFileType(note)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {note.summary || note.raw_markdown?.substring(0, 200) || ""}
                    </p>
                  </CardContent>
                  <CardFooter className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={note.users?.avatar_url || ""}
                          alt={note.users?.username}
                        />
                        <AvatarFallback className="text-xs">
                          {note.users?.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground">
                        {note.users?.username}
                      </span>
                    </div>
                    <NoteScoreBadge
                      noteId={note.id}
                      content={note.raw_markdown || note.summary || ""}
                      title={note.title}
                      preloadedScore={note.validation_score}
                      preloadedReason={(note as any).validation_feedback ?? undefined}
                    />
                  </CardFooter>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-2"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => {
              const params = new URLSearchParams();
              if (initialQuery) params.set("q", initialQuery);
              params.set("page", String(currentPage - 1));
              router.push(`/explore?${params.toString()}`);
            }}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => {
              const params = new URLSearchParams();
              if (initialQuery) params.set("q", initialQuery);
              params.set("page", String(currentPage + 1));
              router.push(`/explore?${params.toString()}`);
            }}
          >
            Next
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
