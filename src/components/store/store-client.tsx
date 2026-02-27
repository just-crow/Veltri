"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Coins,
  DollarSign,
  CreditCard,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingCart,
  TrendingUp,
  Tag,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Transaction } from "@/lib/types";

const POINTS_PER_DOLLAR = 100;

const PRESET_AMOUNTS = [10, 25, 50, 100];

interface StoreClientProps {
  pointsBalance: number;
  dollarBalance: number;
  initialTransactions: Transaction[];
}

export function StoreClient({
  pointsBalance,
  dollarBalance,
  initialTransactions,
}: StoreClientProps) {
  const [amount, setAmount] = useState<number>(10);
  const [buying, setBuying] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [balance, setBalance] = useState(pointsBalance);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [promoCode, setPromoCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const router = useRouter();

  const pointsToReceive = amount * POINTS_PER_DOLLAR;

  const handleBuyPoints = async () => {
    toast.error("Not implemented yet");
    return;
  };

  const handleRedeemPromo = async () => {
    if (!promoCode.trim()) {
      toast.error("Please enter a promo code");
      return;
    }

    setRedeeming(true);
    try {
      const res = await fetch("/api/store/redeem-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Redemption failed");

      setBalance(data.new_balance);
      toast.success(
        `${data.message} You received ${data.points_received.toLocaleString()} points!`
      );
      setPromoCode("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRedeeming(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "points_purchase":
        return <ArrowDownLeft className="h-4 w-4 text-green-500" />;
      case "note_bought_points":
      case "note_bought_dollars":
        return <ShoppingCart className="h-4 w-4 text-blue-500" />;
      case "note_sale":
        return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case "promo_code_redemption":
        return <Tag className="h-4 w-4 text-purple-500" />;
      default:
        return <DollarSign className="h-4 w-4" />;
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case "points_purchase":
        return "Bought Points";
      case "note_bought_points":
        return "Note Purchase (Points)";
      case "note_bought_dollars":
        return "Note Purchase ($)";
      case "note_sale":
        return "Sale Revenue";
      case "promo_code_redemption":
        return "Promo Code Redeemed";
      default:
        return type;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-bold">Points Store</h1>
        <p className="text-muted-foreground mt-1">
          Buy points to purchase premium notes. $1 = {POINTS_PER_DOLLAR} points.
        </p>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Coins className="h-4 w-4" /> Points Balance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {balance.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ≈ ${(balance / POINTS_PER_DOLLAR).toFixed(2)} value
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" /> Publisher Earnings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${dollarBalance.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From note sales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Buy Points */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Buy Points
          </CardTitle>
          <CardDescription>
            Choose an amount or enter a custom value. Minimum $10.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PRESET_AMOUNTS.map((preset) => (
              <Button
                key={preset}
                variant={amount === preset ? "default" : "outline"}
                onClick={() => setAmount(preset)}
                className="flex flex-col items-center py-6"
              >
                <span className="text-lg font-bold">${preset}</span>
                <span className="text-xs opacity-70">
                  {(preset * POINTS_PER_DOLLAR).toLocaleString()} pts
                </span>
              </Button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="custom-amount">Custom Amount ($)</Label>
              <Input
                id="custom-amount"
                type="number"
                min="10"
                step="1"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
                className="mt-1"
              />
            </div>
            <div className="text-right sm:text-right text-center pb-2">
              <p className="text-sm text-muted-foreground">You will receive</p>
              <p className="text-lg font-bold">
                {pointsToReceive.toLocaleString()} pts
              </p>
            </div>
          </div>

          <Button
            className="w-full gap-2"
            size="lg"
            disabled={amount < 10}
            onClick={() => setDialogOpen(true)}
          >
            <CreditCard className="h-4 w-4" />
            Buy {pointsToReceive.toLocaleString()} Points for $
            {amount}
          </Button>
        </CardContent>
      </Card>

      {/* Promo Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" /> Redeem Promo Code
          </CardTitle>
          <CardDescription>
            Have a promo code? Enter it here to get free points!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="promo-code">Promo Code</Label>
              <Input
                id="promo-code"
                type="text"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !redeeming) {
                    handleRedeemPromo();
                  }
                }}
                className="mt-1 uppercase"
                disabled={redeeming}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleRedeemPromo}
                disabled={!promoCode.trim() || redeeming}
                className="w-full sm:w-auto gap-2"
              >
                {redeeming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redeeming...
                  </>
                ) : (
                  <>
                    <Tag className="h-4 w-4" />
                    Redeem
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3">
                    {getTransactionIcon(tx.type)}
                    <div>
                      <p className="text-sm font-medium">
                        {getTransactionLabel(tx.type)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(tx.created_at), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {tx.points_amount !== 0 && (
                      <p className="text-sm font-medium">
                        {tx.type === "points_purchase" || tx.type === "promo_code_redemption"
                          ? "+"
                          : tx.type.includes("bought")
                            ? "-"
                            : ""}
                        {tx.points_amount.toLocaleString()} pts
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      ${Number(tx.amount).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mock Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Purchase</DialogTitle>
            <DialogDescription>
              This is a mock payment. In production, this would use Stripe or
              similar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">${amount}.00</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Points</span>
                <span className="font-medium">
                  {pointsToReceive.toLocaleString()} pts
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Card Number (Mock)</Label>
              <Input
                placeholder="4242 4242 4242 4242"
                defaultValue="4242 4242 4242 4242"
                className="font-mono"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Expiry</Label>
                  <Input placeholder="12/28" defaultValue="12/28" />
                </div>
                <div>
                  <Label>CVC</Label>
                  <Input placeholder="123" defaultValue="123" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBuyPoints}
              disabled={buying}
              className="gap-2"
            >
              {buying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Pay ${amount}.00
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
