"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { SocketProvider } from "@/lib/socket";
import AuthModal from "./AuthModal";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SocketProvider>
        {children}
        <AuthModal />
      </SocketProvider>
    </AuthProvider>
  );
}
