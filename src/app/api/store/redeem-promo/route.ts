import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";

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

    // Rate limit: 5 redemptions per minute
    const rlKey = getRateLimitKey(request, "redeem-promo");
    const rl = rateLimit(rlKey, { limit: 5, windowSeconds: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Invalid promo code" }, { status: 400 });
    }

    // Call the database function to redeem the promo code
    const { data, error } = await (supabase as any).rpc("redeem_promo_code", {
      p_code: code.trim().toUpperCase(),
      p_user_id: user.id,
    });

    if (error) {
      console.error("redeem_promo_code rpc error:", error);
      return NextResponse.json({ error: error.message || "Failed to redeem promo code" }, { status: 500 });
    }

    // The function returns a single row with success, message, points_received
    const result = Array.isArray(data) ? data[0] : data;

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    // Get updated user balance
    const { data: userData } = await supabase
      .from("users")
      .select("points_balance")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      success: true,
      message: result.message,
      points_received: result.points_received,
      new_balance: userData?.points_balance || 0,
    });
  } catch (error: any) {
    console.error("Promo code redemption error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
