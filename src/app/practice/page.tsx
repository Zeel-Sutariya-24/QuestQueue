import { Suspense } from "react";
import PracticeClient from "./PracticeClient";

export const metadata = { title: "Practice — Quest Queue" };

export default function PracticePage() {
  return (
    <Suspense fallback={<p className="animate-blink text-slate-400">Loading…</p>}>
      <PracticeClient />
    </Suspense>
  );
}
