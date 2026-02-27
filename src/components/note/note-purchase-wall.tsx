"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Lock, Coins, DollarSign, Loader2, ShieldAlert, Star, Building2 } from "lucide-react";

const POINTS_PER_DOLLAR = 100;
const POINTS_DISCOUNT = 0.05;

interface NotePurchaseWallProps {
  noteId: string;
  title: string;
  description: string | null;
  previewTeaser: string | null;
  previewStart: string | null;
  authorUsername: string;
  price: number;
  userPointsBalance: number | null; // null = not logged in
  isLoggedIn: boolean;
  isExclusive?: boolean;
  isSold?: boolean;
  orgDiscountPercent?: number;  // 0-100, org member discount
  orgName?: string;             // e.g. "MIT"
}

export function NotePurchaseWall({
  noteId,
  title,
  description,
  previewTeaser,
  previewStart,
  authorUsername,
  price,
  userPointsBalance,
  isLoggedIn,
  isExclusive = false,
  isSold = false,
  orgDiscountPercent = 0,
  orgName,
}: NotePurchaseWallProps) {
  const [purchasing, setPurchasing] = useState(false);
  const router = useRouter();

  const orgFactor = 1 - orgDiscountPercent / 100;
  const effectivePrice = price * orgFactor;
  const pointsCost = Math.ceil(effectivePrice * (1 - POINTS_DISCOUNT) * POINTS_PER_DOLLAR);
  const hasEnoughPoints =
    userPointsBalance !== null && userPointsBalance >= pointsCost;

  const handlePurchase = async (method: "points" | "dollars") => {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    // Dollar payment not implemented yet
    if (method === "dollars") {
      toast.error("Dollar payment not implemented yet");
      return;
    }

    setPurchasing(true);
    try {
      const res = await fetch("/api/store/purchase-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, paymentMethod: method }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");

      toast.success("Purchase successful! Enjoy your note.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPurchasing(false);
    }
  };

  // If the exclusive note has already been sold, nothing to buy
  if (isSold) {
    return (
      <Card className="max-w-md mx-auto border-2 border-destructive/30">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto bg-destructive/10 w-12 h-12 rounded-full flex items-center justify-center mb-2">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Exclusively Sold</CardTitle>
          <CardDescription>
            This note was sold with full exclusive rights.{" "}
            <span className="font-medium">{authorUsername}</span> has transferred
            ownership and it is no longer available for purchase.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="relative">
      {/* Author-provided description (primary) or auto-teaser (fallback) */}
      {description ? (
        <p className="text-base text-foreground mb-6 leading-relaxed">
          {description}
        </p>
      ) : previewTeaser ? (
        <p className="text-base text-muted-foreground italic mb-6 line-clamp-2">
          {previewTeaser}
          <span className="not-italic font-medium text-foreground"> …</span>
        </p>
      ) : null}

      {previewStart && (
        <div className="mb-6 rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Preview of the beginning
          </p>
          <div className="relative max-h-48 overflow-hidden">
            <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
              {previewStart}
            </p>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background to-transparent" />
          </div>
        </div>
      )}

      {/* Blurred skeleton — content hidden */}
      <div className="h-48 bg-gradient-to-b from-muted/30 to-muted/80 rounded-lg overflow-hidden mb-8 select-none pointer-events-none blur-sm">
        <div className="space-y-3 w-full px-8 pt-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-4 bg-muted-foreground/10 rounded"
              style={{ width: `${55 + ((i * 13) % 40)}%` }}
            />
          ))}
        </div>
      </div>

      {/* Purchase card */}
      <Card className="max-w-md mx-auto border-2 border-primary/20">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-2">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <CardTitle className="text-xl">Premium Note</CardTitle>
            {isExclusive && (
              <Badge className="bg-violet-600 hover:bg-violet-700 text-xs gap-1">
                <Star className="h-3 w-3" /> Exclusive
              </Badge>
            )}
          </div>
          <CardDescription>
            This note by <span className="font-medium">{authorUsername}</span> requires purchase
            {isExclusive && (
              <span className="block mt-1 text-violet-500 font-medium">
                One-time sale — full rights included
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            {orgDiscountPercent > 0 ? (
              <>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-xl line-through text-muted-foreground/60">${price.toFixed(2)}</span>
                  <span className="text-3xl font-bold">${effectivePrice.toFixed(2)}</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/40 px-2.5 py-0.5 text-xs font-semibold">
                  <Building2 className="h-3 w-3" />
                  {orgName ?? "Org"} member — {orgDiscountPercent}% off
                </div>
              </>
            ) : (
              <div className="text-3xl font-bold">${price.toFixed(2)}</div>
            )}
          </div>

          {!isLoggedIn ? (
            <Button
              className="w-full gap-2"
              onClick={() => router.push("/login")}
            >
              Sign in to purchase
            </Button>
          ) : (
            <div className="space-y-2">
              <Button
                className="w-full gap-2"
                variant="default"
                onClick={() => handlePurchase("points")}
                disabled={purchasing || !hasEnoughPoints}
              >
                {purchasing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Coins className="h-4 w-4" />
                )}
                <span className="truncate">Buy with {pointsCost.toLocaleString()} pts</span>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {orgDiscountPercent > 0 ? `${orgDiscountPercent + 5}%+ off` : "5% off"}
                </Badge>
              </Button>
              {!hasEnoughPoints && userPointsBalance !== null && (
                <p className="text-xs text-muted-foreground text-center">
                  You have {userPointsBalance.toLocaleString()} pts.{" "}
                  <a href="/store" className="text-primary underline">
                    Buy more points
                  </a>
                </p>
              )}
              <Button
                className="w-full gap-2"
                variant="outline"
                onClick={() => handlePurchase("dollars")}
                disabled={purchasing}
              >
                {purchasing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <DollarSign className="h-4 w-4" />
                )}
                Pay ${effectivePrice.toFixed(2)}
                {orgDiscountPercent > 0 && (
                  <Badge variant="secondary" className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400">
                    {orgDiscountPercent}% off
                  </Badge>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
