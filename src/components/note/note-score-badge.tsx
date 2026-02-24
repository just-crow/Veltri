"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import { scoreNote } from "@/lib/nvidia-browser";

interface NoteScoreBadgeProps {
  noteId: string;
  content?: string;
  title?: string;
  preloadedScore?: number | null;
  preloadedReason?: string;
}

export function NoteScoreBadge({ noteId, content, title, preloadedScore, preloadedReason }: NoteScoreBadgeProps) {
  const [score, setScore] = useState<number | null>(preloadedScore ?? null);
  const [reason, setReason] = useState<string>(preloadedReason ?? "");
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(preloadedScore != null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync when preloaded props arrive/change (e.g. after DB fetch)
  useEffect(() => {
    if (preloadedScore != null) {
      setScore(preloadedScore);
      fetchedRef.current = true;
    }
    if (preloadedReason) {
      setReason(preloadedReason);
    }
  }, [preloadedScore, preloadedReason]);

  useEffect(() => {
    if (fetchedRef.current) return;
    
    // Don't fetch if we don't have content/title (means we're using preloaded data only)
    if (!content || !title) return;

    // Cache in sessionStorage to avoid re-fetching on same session
    const cacheKey = `note_score_${noteId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { score: s, reason: r } = JSON.parse(cached);
        setScore(s);
        setReason(r);
        return;
      } catch {}
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          observer.disconnect();

          setLoading(true);
          scoreNote({ content, title })
            .then((data) => {
              setScore(data.score);
              setReason(data.reason);
              sessionStorage.setItem(cacheKey, JSON.stringify(data));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
        }
      },
      { threshold: 0.2 }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [noteId, content, title]);

  return (
    <div ref={containerRef} className="flex items-center gap-1 text-xs">
      {loading ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground font-medium">Scoring...</span>
        </>
      ) : score !== null ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 cursor-help"
            >
              <Stars score={Math.max(0, score)} />
              <span className="text-muted-foreground font-medium">{score}/10</span>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-xs">
            {reason || "No quality reason available"}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function Stars({ score }: { score: number }) {
  const filled = Math.round(score / 2); // out of 5
  return (
    <span className="text-amber-400 leading-none" aria-label={`${score} out of 10`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < filled ? "★" : "☆"}</span>
      ))}
    </span>
  );
}
