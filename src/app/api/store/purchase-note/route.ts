import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getOrgDomain } from "@/lib/org-utils";

const POINTS_PER_DOLLAR = 100;
const POINTS_DISCOUNT = 0.05; // 5% discount when paying with points

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 10 purchases per minute
    const rlKey = getRateLimitKey(request, "purchase-note");
    const rl = rateLimit(rlKey, { limit: 10, windowSeconds: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { noteId, paymentMethod } = await request.json();

    if (!noteId || !paymentMethod || !["points", "dollars"].includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Fetch note WITH author user to verify shared org
    const { data: noteData } = await (supabase as any)
      .from("notes")
      .select(`
        *,
        users ( email )
      `)
      .eq("id", noteId)
      .single();

    if (!noteData || !noteData.is_published) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const note = noteData as {
      id: string;
      user_id: string;
      price: number;
      title: string;
      is_published: boolean;
      is_exclusive: boolean;
      is_sold: boolean;
      users?: { email: string };
    };

    if (note.price <= 0) {
      return NextResponse.json({ error: "This note is free" }, { status: 400 });
    }

    // Can't buy your own note
    if (note.user_id === user.id) {
      return NextResponse.json(
        { error: "You can't purchase your own note" },
        { status: 400 }
      );
    }

    // Exclusive note already sold — off the market
    if (note.is_exclusive && note.is_sold) {
      return NextResponse.json(
        { error: "This exclusive note has already been sold and is no longer available." },
        { status: 410 }
      );
    }

    const dollarPrice = Number(note.price);

    // Apply org member discount ONLY if buyer and author share the same org domain
    let orgDiscountFactor = 1;
    const buyerOrgDomain = getOrgDomain(user.email ?? "");
    const authorOrgDomain = getOrgDomain(note.users?.email ?? "");

    if (buyerOrgDomain && authorOrgDomain && buyerOrgDomain === authorOrgDomain) {
      const { data: orgData } = await (supabase as any)
        .from("organizations")
        .select("discount_percent")
        .eq("domain", buyerOrgDomain)
        .maybeSingle();
      if (orgData?.discount_percent > 0) {
        orgDiscountFactor = 1 - (orgData.discount_percent as number) / 100;
      }
    }
    const effectiveDollarPrice = dollarPrice * orgDiscountFactor;

    // Calculate costs based on payment method
    let amountCharged: number;
    let pointsCost: number;

    if (paymentMethod === "points") {
      const discountedDollar = effectiveDollarPrice * (1 - POINTS_DISCOUNT);
      pointsCost = Math.ceil(discountedDollar * POINTS_PER_DOLLAR);
      amountCharged = discountedDollar;
    } else {
      // ---- MOCK DOLLAR PAYMENT ----
      const paymentSuccess = true;
      if (!paymentSuccess) {
        return NextResponse.json({ error: "Payment failed" }, { status: 402 });
      }
      // ---- END MOCK ----
      pointsCost = 0;
      amountCharged = effectiveDollarPrice;
    }

    // Atomic DB transaction: everything in one call
    const { data, error } = await (supabase as any).rpc("purchase_note", {
      p_buyer_id: user.id,
      p_note_id: noteId,
      p_payment_method: paymentMethod,
      p_dollar_price: dollarPrice,
      p_amount_charged: amountCharged,
      p_points_cost: pointsCost,
    });

    if (error) {
      console.error("purchase_note rpc error:", error);
      const msg = error.message || "Purchase failed";
      if (msg.includes("Insufficient points")) {
        return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
      }
      if (msg.includes("Already purchased")) {
        return NextResponse.json({ error: "You already own this note" }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      payment_method: data.payment_method,
      amount_charged: data.amount_charged,
      points_deducted: data.points_deducted,
      new_points_balance: data.buyer_points_balance,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Purchase failed" },
      { status: 500 }
    );
  }
}
