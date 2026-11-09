import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

export function AuthScreen() {
  const [tab, setTab] = useState("login");

  // login
  const [lEmail, setLEmail] = useState("");
  const [lPass, setLPass] = useState("");
  const [lLoading, setLLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // signup
  const [sEmail, setSEmail] = useState("");
  const [sPass, setSPass] = useState("");
  const [sUser, setSUser] = useState("");
  const [sAvatar, setSAvatar] = useState<File | null>(null);
  const [sPreview, setSPreview] = useState<string | null>(null);
  const [sLoading, setSLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLLoading(true);
    const normalizedEmail = lEmail.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: lPass,
    });
    setLLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome back!");
  };

  const handleForgotPassword = async () => {
    const email = lEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Please enter your email address first");
      return;
    }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      toast.success("Password reset email sent! Check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sUser.trim().length < 3) return toast.error("Username must be at least 3 characters");
    if (sPass.length < 6) return toast.error("Password must be at least 6 characters");
    setSLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: sEmail,
        password: sPass,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username: sUser.trim() },
        },
      });
      if (error) throw error;
      const uid = data.user?.id;
      if (uid && sAvatar) {
        const ext = sAvatar.name.split(".").pop() ?? "png";
        const path = `${uid}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, sAvatar, { upsert: true, contentType: sAvatar.type });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
          await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", uid);
        }
      }
      // Ensure username persisted (if trigger fallback ran)
      if (uid) {
        await supabase.from("profiles").update({ username: sUser.trim() }).eq("id", uid);
      }
      toast.success("Account created!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSLoading(false);
    }
  };

  const onAvatar = (f: File | null) => {
    setSAvatar(f);
    if (f) {
      const r = new FileReader();
      r.onload = () => setSPreview(r.result as string);
      r.readAsDataURL(f);
    } else setSPreview(null);
  };

  return (
    <div className="min-h-screen w-full grid place-items-center px-4 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/15 grid place-items-center ring-1 ring-primary/30 mb-3">
            <span className="text-primary text-2xl font-black">♞</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">BotBoard</h1>
          <p className="text-xs text-muted-foreground">Sign in to enter the arena</p>
        </div>
        <Card className="p-5 bg-card">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="login">Log In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={lEmail}
                    onChange={(e) => setLEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Password</Label>
                  <Input
                    type="password"
                    required
                    value={lPass}
                    onChange={(e) => setLPass(e.target.value)}
                  />
                  <div className="flex justify-end mt-1.5">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      {resetLoading ? "Sending reset email…" : "Forgot Password?"}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={lLoading}>
                  {lLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Log In
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-secondary overflow-hidden grid place-items-center ring-1 ring-border shrink-0">
                    {sPreview ? (
                      <img src={sPreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Upload className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Profile Picture</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onAvatar(e.target.files?.[0] ?? null)}
                      className="text-xs"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Username</Label>
                  <Input
                    required
                    minLength={3}
                    value={sUser}
                    onChange={(e) => setSUser(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    required
                    value={sEmail}
                    onChange={(e) => setSEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Password</Label>
                  <Input
                    type="password"
                    required
                    minLength={6}
                    value={sPass}
                    onChange={(e) => setSPass(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={sLoading}>
                  {sLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
