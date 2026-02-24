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
import { Search, Globe, X } from "lucide-react";
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

interface ActiveFilters {
  sort: string;
  type: string;
  price: string;
  exclusive: string;
  minScore: number;
}

interface ExploreClientProps {
  initialNotes: (Note & { users: User })[];
  initialQuery: string;
  totalCount: number;
  currentPage: number;
  perPage: number;
  userRatings?: Record<string, number>;
  activeFilters?: ActiveFilters;
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

export function ExploreClient({
  initialNotes,
  initialQuery,
  totalCount,
  currentPage,
  perPage,
  userRatings = {},
  activeFilters,
}: ExploreClientProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const router = useRouter();
  const totalPages = Math.ceil(totalCount / perPage);

  const currentSort = activeFilters?.sort || "newest";
  const currentType = activeFilters?.type || "all";
  const currentPrice = activeFilters?.price || "all";
  const currentExclusive = activeFilters?.exclusive || "all";
  const currentMinScore = activeFilters?.minScore || 0;

  const buildUrl = (overrides: Partial<{ q: string; sort: string; type: string; price: string; exclusive: string; minScore: number; page: number }>) => {
    const params = new URLSearchParams();
    const q = overrides.q ?? searchQuery;
    const sort = overrides.sort ?? currentSort;
    const type = overrides.type ?? currentType;
    const price = overrides.price ?? currentPrice;
    const exclusive = overrides.exclusive ?? currentExclusive;
    const minScore = overrides.minScore ?? currentMinScore;
    const page = overrides.page;

    if (q) params.set("q", q);
    if (sort && sort !== "newest") params.set("sort", sort);
    if (type && type !== "all") params.set("type", type);
    if (price && price !== "all") params.set("price", price);
    if (exclusive && exclusive !== "all") params.set("exclusive", exclusive);
    if (minScore > 0) params.set("minScore", String(minScore));
    if (page && page > 1) params.set("page", String(page));
    return `/explore?${params.toString()}`;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(buildUrl({ q: searchQuery }));
  };

  const hasActiveFilters =
    currentSort !== "newest" ||
    currentType !== "all" ||
    currentPrice !== "all" ||
    currentExclusive !== "all" ||
    currentMinScore > 0;

  const activeFilterCount = [currentSort !== "newest", currentType !== "all", currentPrice !== "all", currentExclusive !== "all", currentMinScore > 0].filter(Boolean).length;

  const clearFilters = () => {
    router.push(buildUrl({ sort: "newest", type: "all", price: "all", exclusive: "all", minScore: 0 }));
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

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Left: filters */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">Sort</span>
            {(["newest", "oldest", "top-rated", "price-low"] as const).map((v) => {
              const labels: Record<string, string> = { newest: "New", oldest: "Old", "top-rated": "Top", "price-low": "Price ↑" };
              return <FilterChip key={v} label={labels[v]} active={currentSort === v} onClick={() => router.push(buildUrl({ sort: v }))} />;
            })}
          </div>

          <span className="hidden sm:inline-block w-px h-4 bg-border" />

          {/* File type */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">Type</span>
            {(["all", "note", "pdf", "docx"] as const).map((v) => {
              const labels: Record<string, string> = { all: "All", note: "Note", pdf: "PDF", docx: "DOCX" };
              return <FilterChip key={v} label={labels[v]} active={currentType === v} onClick={() => router.push(buildUrl({ type: v }))} />;
            })}
          </div>

          <span className="hidden sm:inline-block w-px h-4 bg-border" />

          {/* Price */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">Price</span>
            {(["all", "free", "paid"] as const).map((v) => (
              <FilterChip key={v} label={v.charAt(0).toUpperCase() + v.slice(1)} active={currentPrice === v} onClick={() => router.push(buildUrl({ price: v }))} />
            ))}
          </div>

          <span className="hidden sm:inline-block w-px h-4 bg-border" />

          {/* Score */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">Score</span>
            {([0, 5, 7, 9] as const).map((v) => (
              <FilterChip key={v} label={v === 0 ? "Any" : `${v}+`} active={currentMinScore === v} onClick={() => router.push(buildUrl({ minScore: v }))} />
            ))}
          </div>
        </div>

        {/* Right: exclusive */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Exclusive</span>
          {(["all", "yes", "no"] as const).map((v) => {
            const labels: Record<string, string> = { all: "All", yes: "Only", no: "Hide" };
            return <FilterChip key={v} label={labels[v]} active={currentExclusive === v} onClick={() => router.push(buildUrl({ exclusive: v }))} />;
          })}
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
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
              router.push(buildUrl({ page: currentPage - 1 }));
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
              router.push(buildUrl({ page: currentPage + 1 }));
            }}
          >
            Next
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
