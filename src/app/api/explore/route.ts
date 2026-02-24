import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const perPage = 12;
  const offset = (page - 1) * perPage;

  const supabase = await createClient();

  let query = (supabase as any)
    .from("notes")
    .select(
      "id, title, slug, summary, raw_markdown, created_at, validation_score, validation_feedback, original_file_name, original_file_type, price, is_exclusive, is_sold, users(id, username, avatar_url)",
      { count: "exact" }
    )
    .eq("is_published", true)
    .or("is_exclusive.eq.false,is_sold.eq.false")
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (q) {
    query = query.textSearch("fts", q, { type: "websearch" });
  }

  const { data: notes, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }

  // Fetch avg ratings for authors on this page
  const userRatings: Record<string, number> = {};
  const userIds = [
    ...new Set(
      ((notes as any[]) ?? [])
        .map((n: any) => n.users?.id)
        .filter(Boolean) as string[]
    ),
  ];

  if (userIds.length > 0) {
    const { data: ratingsData } = await (supabase as any)
      .from("user_reviews")
      .select("reviewed_user_id, rating")
      .in("reviewed_user_id", userIds);

    if (ratingsData) {
      const grouped: Record<string, number[]> = {};
      for (const r of ratingsData as { reviewed_user_id: string; rating: number }[]) {
        if (!grouped[r.reviewed_user_id]) grouped[r.reviewed_user_id] = [];
        grouped[r.reviewed_user_id].push(r.rating);
      }
      for (const [uid, ratings] of Object.entries(grouped)) {
        userRatings[uid] = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      }
    }
  }

  return NextResponse.json({
    notes: notes ?? [],
    totalCount: count ?? 0,
    page,
    perPage,
    userRatings,
  });
}
