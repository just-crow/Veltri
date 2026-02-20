import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { NoteView } from "@/components/note/note-view";
import { CommentsSection } from "@/components/note/comments-section";
import { NoteQualityPanel } from "@/components/note/note-quality-panel";
import { NoteAiDetectionPanel } from "@/components/note/note-ai-detection-panel";
import { NotePurchaseWall } from "@/components/note/note-purchase-wall";
import { ShieldAlert } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { Note, User } from "@/lib/types";

interface NotePageProps {
  params: Promise<{ username: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: NotePageProps): Promise<Metadata> {
  const { username, slug } = await params;
  const supabase = await createClient();

  const { data: userData } = await (supabase as any)
    .from("users")
    .select("id")
    .eq("username", username)
    .single();

  const user = userData as { id: string } | null;
  if (!user) return { title: "Note Not Found" };

  const { data: noteData } = await (supabase as any)
    .from("notes")
    .select("*")
    .eq("user_id", user.id)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  const note = noteData as Note | null;
  if (!note) return { title: "Note Not Found" };

  return {
    title: note.title,
    description: note.summary || note.raw_markdown?.substring(0, 160) || "",
    openGraph: {
      title: note.title,
      description: note.summary || "",
      type: "article",
    },
  };
}

export default async function NotePage({ params }: NotePageProps) {
  const { username, slug } = await params;
  const supabase = await createClient();

  const { data: authorData } = await (supabase as any)
    .from("users")
    .select("*")
    .eq("username", username)
    .single();

  const author = authorData as User | null;
  if (!author) notFound();

  const { data: noteData } = await (supabase as any)
    .from("notes")
    .select("*")
    .eq("user_id", author.id)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  const note = noteData as Note | null;
  if (!note) notFound();

  // Get tags and comments (always needed)
  const { data: noteTags } = await (supabase as any)
    .from("note_tags")
    .select("tag_id, tags(*)")
    .eq("note_id", note.id);
  const tags = noteTags?.map((nt: any) => nt.tags).filter(Boolean) ?? [];

  const { data: comments } = await (supabase as any)
    .from("comments")
    .select("*, users(*)")
    .eq("note_id", note.id)
    .order("created_at", { ascending: true });

  // Auth + purchase check
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const notePrice = Number(note.price) || 0;
  const isAuthor = currentUser?.id === note.user_id;
  const isExclusive = !!note.is_exclusive;
  const isSold = !!note.is_sold;
  let hasPurchased = false;
  let userPointsBalance: number | null = null;

  if (currentUser) {
    const { data: userProfile } = await (supabase as any)
      .from("users")
      .select("points_balance")
      .eq("id", currentUser.id)
      .single();
    userPointsBalance = (userProfile as any)?.points_balance ?? 0;

    if (notePrice > 0 && !isAuthor) {
      const { data: purchase } = await (supabase as any)
        .from("purchases")
        .select("id")
        .eq("buyer_id", currentUser.id)
        .eq("note_id", note.id)
        .single();
      hasPurchased = !!purchase;
    }
  }

  const canViewContent = notePrice === 0 || isAuthor || hasPurchased;

  // Only generate a short-lived signed URL for authorised viewers.
  // Never use getPublicUrl() — that URL works permanently for anyone who has it.
  let originalFileUrl: string | null = null;
  if (canViewContent && note.original_file_path) {
    const { data: signedData } = await supabase.storage
      .from("note-images")
      .createSignedUrl(note.original_file_path, 3600); // 1-hour expiry
    originalFileUrl = signedData?.signedUrl ?? null;
  }

  // Very limited teaser for the purchase wall (strip markdown symbols, first 150 chars)
  const previewTeaser = note.raw_markdown
    ? note.raw_markdown.replace(/[#*_`>\[\]!]/g, "").trim().substring(0, 150)
    : null;

  const previewStart = note.raw_markdown
    ? note.raw_markdown
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 10)
        .join("\n")
        .substring(0, 900)
    : null;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0 w-full">
          {/* Quality panel - mobile/tablet: shown above content */}
          <div className="lg:hidden mb-6 space-y-4">
            <NoteQualityPanel
              score={(note as any).validation_score ?? null}
              feedback={(note as any).validation_feedback ?? null}
            />
            <NoteAiDetectionPanel
              label={(note as any).ai_detection_label ?? null}
              score={(note as any).ai_detection_score ?? null}
              isLikelyAi={(note as any).ai_detection_is_likely_ai ?? null}
              summary={(note as any).ai_detection_summary ?? null}
            />
          </div>

          {canViewContent ? (
            <>
              <NoteView
                note={note}
                author={author}
                tags={tags as any}
                originalFileUrl={originalFileUrl}
                isExclusive={isExclusive}
                isSold={isSold}
              />
              <CommentsSection
                noteId={note.id}
                initialComments={(comments as any) ?? []}
                currentUserId={currentUser?.id ?? null}
              />
            </>
          ) : (
            <div>
              <header className="space-y-4 mb-8">
                <h1 className="text-4xl font-bold tracking-tight">{note.title}</h1>
              </header>
              <NotePurchaseWall
                noteId={note.id}
                title={note.title}
                description={note.description ?? null}
                previewTeaser={previewTeaser}
                previewStart={previewStart}
                authorUsername={author.username}
                price={notePrice}
                userPointsBalance={userPointsBalance}
                isLoggedIn={!!currentUser}
                isExclusive={isExclusive}
                isSold={isSold}
              />
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
            </div>
          )}
        </div>
        {/* Quality sidebar - desktop only */}
        <div className="w-64 shrink-0 hidden lg:block space-y-4">
          <NoteQualityPanel
            score={(note as any).validation_score ?? null}
            feedback={(note as any).validation_feedback ?? null}
          />
          <NoteAiDetectionPanel
            label={(note as any).ai_detection_label ?? null}
            score={(note as any).ai_detection_score ?? null}
            isLikelyAi={(note as any).ai_detection_is_likely_ai ?? null}
            summary={(note as any).ai_detection_summary ?? null}
          />
        </div>
      </div>
    </div>
  );
}
