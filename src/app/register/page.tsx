"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Github, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!agreed) {
      toast.error("You must agree to the Terms of Service and Privacy Policy");
      setLoading(false);
      return;
    }

    if (username.length < 3) {
      toast.error("Username must be at least 3 characters");
      setLoading(false);
      return;
    }

    // Check if username is taken
    const { data: existingUsername } = await (supabase as any)
      .from("users")
      .select("id")
      .eq("username", username)
      .single();

    if (existingUsername) {
      toast.error("Username is already taken");
      setLoading(false);
      return;
    }

    // Check if email is already registered
    const { data: existingEmail } = await (supabase as any)
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingEmail) {
      toast.error("Email is already registered");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      toast.success("Account created. You are signed in.");
      router.push("/dashboard");
      router.refresh();
      return;
    }

    toast.success("Account created! Verify your email to continue.");
    router.push(`/verify-email?email=${encodeURIComponent(email)}`);
  };

  const handleGitHubLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        <Card className="w-full">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-2">
              <Image
                src="/logo.png"
                alt="Jotly Logo"
                width={1536}
                height={1024}
                className="h-20 w-auto object-contain dark:invert"
              />
            </div>
            <CardTitle className="text-2xl font-bold">Create account</CardTitle>
            <CardDescription>
              Join Jotly to start writing and publishing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleGitHubLogin}
            >
              <Github className="mr-2 h-4 w-4" />
              Continue with GitHub
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="johndoe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="terms" 
                  checked={agreed}
                  onCheckedChange={(checked: boolean | "indeterminate") =>
                    setAgreed(checked === true)
                  }
                  required 
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="terms"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I agree to the <Link href="/terms" className="underline text-primary" target="_blank">Terms of Service</Link> and <Link href="/privacy" className="underline text-primary" target="_blank">Privacy Policy</Link>.
                  </label>
                  <p className="text-[0.8rem] text-muted-foreground">
                    Note: A 30% platform fee applies to all sales.
                  </p>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
