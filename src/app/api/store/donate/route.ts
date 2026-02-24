import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";

const ALLOWED_AMOUNTS = [25, 50, 100, 200];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 10 donations per minute
    const rlKey = getRateLimitKey(request, "donate");
    const rl = rateLimit(rlKey, { limit: 10, windowSeconds: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { noteId, points, message } = await request.json();

    if (!noteId || !points || !ALLOWED_AMOUNTS.includes(points)) {
      return NextResponse.json(
        { error: "Invalid donation amount. Choose 25, 50, 100, or 200 points." },
        { status: 400 }
      );
    }

    // Fetch note (must be free and published)
    const { data: noteData } = await (supabase as any)
      .from("notes")
      .select("id, user_id, price, is_published")
      .eq("id", noteId)
      .single();

    if (!noteData || !noteData.is_published) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    if (Number(noteData.price) > 0) {
      return NextResponse.json(
        { error: "Donations are only available for free notes." },
        { status: 400 }
      );
    }

    if (noteData.user_id === user.id) {
      return NextResponse.json(
        { error: "You cannot donate to your own note." },
        { status: 400 }
      );
    }

    const recipientId: string = noteData.user_id;

    // Fetch donor's current balance
    const { data: donorData, error: donorErr } = await (supabase as any)
      .from("users")
      .select("points_balance")
      .eq("id", user.id)
      .single();

    if (donorErr || !donorData) {
      return NextResponse.json({ error: "Failed to fetch balance." }, { status: 500 });
    }

    const currentBalance: number = donorData.points_balance ?? 0;
    if (currentBalance < points) {
      return NextResponse.json(
        { error: "Insufficient points balance." },
        { status: 400 }
      );
    }

    // 30% platform fee — recipient gets 70%
    const PLATFORM_FEE = 0.30;
    const recipientPoints = Math.floor(points * (1 - PLATFORM_FEE));

    // Deduct from donor
    const { error: deductErr } = await (supabase as any)
      .from("users")
      .update({ points_balance: currentBalance - points })
      .eq("id", user.id)
      .eq("points_balance", currentBalance); // optimistic lock

    if (deductErr) {
      return NextResponse.json(
        { error: "Failed to deduct points. Please try again." },
        { status: 500 }
      );
    }

    // Credit to recipient (after platform fee)
    const { data: recipientData } = await (supabase as any)
      .from("users")
      .select("points_balance")
      .eq("id", recipientId)
      .single();

    await (supabase as any)
      .from("users")
      .update({ points_balance: (recipientData?.points_balance ?? 0) + recipientPoints })
      .eq("id", recipientId);

    // Record the donation
    await (supabase as any).from("donations").insert({
      donor_id: user.id,
      recipient_id: recipientId,
      note_id: noteId,
      points_amount: points,
      points_received: recipientPoints,
      message: message?.trim() || null,
    });

    return NextResponse.json({
      success: true,
      points_donated: points,
      points_received: recipientPoints,
      new_balance: currentBalance - points,
    });
  } catch {
    return NextResponse.json({ error: "Donation failed" }, { status: 500 });
  }
}
