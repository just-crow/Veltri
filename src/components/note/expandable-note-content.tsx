"use client";

import { useState } from "react";
import { SafeHtmlContent } from "./safe-html-content";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandableNoteContentProps {
  html: string;
}

const COLLAPSED_HEIGHT = 480; // px

export function ExpandableNoteContent({ html }: ExpandableNoteContentProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative">
      <div
        style={expanded ? undefined : { maxHeight: COLLAPSED_HEIGHT, overflow: "hidden" }}
        className="transition-all duration-300"
      >
        <SafeHtmlContent
          html={html}
          className="prose prose-lg dark:prose-invert max-w-none overflow-x-auto break-words"
        />
      </div>

      {/* Fade-out gradient when collapsed */}
      {!expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      )}

      <div className={`flex justify-center ${expanded ? "mt-6" : "mt-2 relative"}`}>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <><ChevronUp className="h-4 w-4" /> Show less</>
          ) : (
            <><ChevronDown className="h-4 w-4" /> Show more</>
          )}
        </Button>
      </div>
    </div>
  );
}
