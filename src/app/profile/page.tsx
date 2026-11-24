"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export default function MyProfileRedirect() {
  const { user, loading, setOpenAuth } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (user) router.replace(`/profile/${user.username}`);
    else setOpenAuth(true);
  }, [user, loading, router, setOpenAuth]);
  return <p className="card p-6 text-slate-300">{loading || user ? "Loading your profile…" : "Log in to see your profile."}</p>;
}
