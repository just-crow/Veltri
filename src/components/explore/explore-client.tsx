"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { Search, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Note, User } from "@/lib/types";
import { NotePriceBadge } from "@/components/note/note-price-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
      return "text-rose-500/80 dark:text-rose-400/70 bg-rose-500/8 rounded px-1 py-0.5";
    case "DOCX":
      return "text-blue-500/80 dark:text-blue-400/70 bg-blue-500/8 rounded px-1 py-0.5";
    default:
      return "text-muted-foreground/70 bg-muted/60 rounded px-1 py-0.5";
  }
}

interface ExploreClientProps {
  initialNotes: (Note & { users: User })[];
  initialQuery: string;
  totalCount: number;
  currentPage: number;
  perPage: number;
  userRatings?: Record<string, number>;
}

export function ExploreClient({
  initialNotes,
  initialQuery,
  totalCount,
  currentPage,
  perPage,
  userRatings = {},
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
          <AnimatePresence>
          {initialNotes.map((note, i) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, type: "spring", stiffness: 260, damping: 20 }}
              whileHover={{ y: -4, transition: { duration: 0.18 } }}
            >
              <Link href={`/note/${note.users?.username}/${note.slug}`}>
                <Card className="h-full flex flex-col hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardHeader className="space-y-1.5 pb-3">
                    {/* Row 1: Title + Price */}
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base font-semibold leading-snug tracking-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {note.title.replace(/_/g, " ")}
                      </CardTitle>
                      <div className="shrink-0 mt-0.5">
                        <NotePriceBadge price={note.price} isExclusive={note.is_exclusive} isSold={note.is_sold} />
                      </div>
                    </div>
                    {/* Row 2: Date • Format (metadata grouped) */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{format(new Date(note.created_at), "MMM d, yyyy")}</span>
                      <span className="text-muted-foreground/40">•</span>
                      <span className={`text-xs ${fileTypeBadgeClass(inferFileType(note))}`}>
                        {inferFileType(note)}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 pb-4">
                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                      {note.summary || note.raw_markdown?.substring(0, 200) || ""}
                    </p>
                  </CardContent>

                  <CardFooter className="mt-auto pt-3 border-t border-border/40 flex items-center justify-between gap-2">
                    {/* Left: Avatar + username only */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarImage src={note.users?.avatar_url || ""} alt={note.users?.username} />
                        <AvatarFallback className="text-xs">
                          {note.users?.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className="text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer truncate"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/u/${note.users?.username}`);
                        }}
                      >
                        {note.users?.username}
                      </span>
                    </div>

                    {/* Right: ★ score /10 with tooltip */}
                    {note.validation_score != null && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 shrink-0 text-sm cursor-help">
                            <span className="text-amber-400">★</span>
                            <span className="font-medium text-foreground">
                              {Number(note.validation_score).toFixed(1)}
                            </span>
                            <span className="text-xs text-muted-foreground">/10</span>
                          </div>
                        </TooltipTrigger>
                        {(note as any).validation_feedback && (
                          <TooltipContent side="top" className="max-w-[200px] text-xs">
                            {(note as any).validation_feedback}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    )}
                  </CardFooter>
                </Card>
              </Link>
            </motion.div>
          ))}
          </AnimatePresence>
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
