"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Heart, Loader2, Coins } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const PRESET_AMOUNTS = [25, 50, 100, 200];

interface NoteDonationButtonProps {
  noteId: string;
  authorUsername: string;
  currentUserPoints: number;
  isLoggedIn: boolean;
}

export function NoteDonationButton({
  noteId,
  authorUsername,
  currentUserPoints,
  isLoggedIn,
}: NoteDonationButtonProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [donated, setDonated] = useState(false);
  const [balance, setBalance] = useState(currentUserPoints);

  const handleDonate = async () => {
    if (!selected) return;

    if (!isLoggedIn) {
      toast.error("Sign in to support this creator.");
      return;
    }

    if (balance < selected) {
      toast.error("Not enough points. Buy more points in the store.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/store/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, points: selected, message }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Donation failed.");
        return;
      }

      setBalance(data.new_balance);
      setDonated(true);
      toast.success(`You sent ${selected} points to @${authorUsername}!`);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Separator className="my-10" />
      <section className="rounded-xl border bg-muted/30 p-6 space-y-5">
        {/* Heading */}
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-500" />
          <h3 className="font-semibold text-base">Support this creator</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Enjoyed this free note? Send a tip to{" "}
          <span className="font-medium text-foreground">@{authorUsername}</span> using
          your points balance.
        </p>

        <AnimatePresence mode="wait">
          {donated ? (
            <motion.div
              key="thanks"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-2 py-4 text-center"
            >
              <Heart className="h-8 w-8 text-rose-500 fill-rose-500" />
              <p className="font-semibold text-base">Thank you for your support!</p>
              <p className="text-sm text-muted-foreground">
                Your tip has been sent to @{authorUsername}.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {/* Preset amounts */}
              <div className="flex flex-wrap gap-2">
                {PRESET_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setSelected(selected === amount ? null : amount)}
                    className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors
                      ${
                        selected === amount
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                  >
                    <Coins className="h-3.5 w-3.5" />
                    {amount} pts
                  </button>
                ))}
              </div>

              {/* Optional message */}
              {selected && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Textarea
                    placeholder="Leave a message for the author (optional)"
                    className="resize-none text-sm"
                    rows={2}
                    maxLength={200}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </motion.div>
              )}

              {/* Balance + submit */}
              <div className="flex items-center justify-between gap-4">
                {isLoggedIn && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Coins className="h-3 w-3" />
                    Your balance: <span className="font-medium text-foreground">{balance} pts</span>
                  </p>
                )}
                <Button
                  onClick={handleDonate}
                  disabled={!selected || loading || !isLoggedIn}
                  className="ml-auto gap-2"
                  size="sm"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Heart className="h-4 w-4" />
                  )}
                  {isLoggedIn ? "Send tip" : "Sign in to tip"}
                </Button>
              </div>

              {!isLoggedIn && (
                <p className="text-xs text-muted-foreground">
                  <a href="/login" className="underline underline-offset-4 hover:text-foreground">
                    Sign in
                  </a>{" "}
                  to send a tip to this creator.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </>
  );
}
