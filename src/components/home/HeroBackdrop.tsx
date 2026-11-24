import PixelSprite from "@/components/PixelSprite";
import { LEGS, PLAYER_PAL, PLAYER_TOP } from "@/game/textures";

const mountains = (fill: string, edge: string, peaks: number[]) => {
  const pts = peaks.map((h, i) => `${i * 64},${200 - h}`).join(" ");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${(peaks.length - 1) * 64}' height='200' shape-rendering='crispEdges'><polygon points='0,200 ${pts} ${(peaks.length - 1) * 64},200' fill='${fill}'/><polyline points='${pts}' fill='none' stroke='${edge}' stroke-width='4'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
};

const FAR = mountains("#2e1065", "#6d28d9", [90, 140, 100, 170, 120, 150, 90, 130, 90]);
const NEAR = mountains("#1e1b4b", "#4338ca", [60, 100, 70, 110, 80, 95, 60, 100, 60]);

/** Animated pixel-art scene: twinkling stars, parallax mountains, a running hero. */
export default function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-b from-[#070815] via-[#1a0f3d] to-[#4c1d95]" />
      {Array.from({ length: 46 }).map((_, i) => (
        <span
          key={i}
          className="absolute bg-white"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 62}%`,
            width: i % 5 === 0 ? 4 : 2,
            height: i % 5 === 0 ? 4 : 2,
            animation: `twinkle ${1.4 + (i % 7) * 0.4}s ${(i % 9) * 0.3}s infinite`,
          }}
        />
      ))}
      <div className="absolute right-[10%] top-[12%] h-16 w-16 rounded-full bg-indigo-100 shadow-[0_0_60px_rgba(199,210,254,0.6)]" />
      <div
        className="absolute bottom-16 left-0 h-[200px] w-full opacity-90"
        style={{ backgroundImage: FAR, backgroundRepeat: "repeat-x", backgroundPositionY: "bottom", animation: "scroll-x 60s linear infinite" }}
      />
      <div
        className="absolute bottom-10 left-0 h-[200px] w-full"
        style={{ backgroundImage: NEAR, backgroundRepeat: "repeat-x", backgroundPositionY: "bottom", animation: "scroll-x 28s linear infinite" }}
      />
      <div
        className="absolute bottom-0 left-0 h-12 w-full"
        style={{
          background:
            "linear-gradient(#2dd4bf 0 8px, #14b8a6 8px 12px, #2b2050 12px) , repeating-linear-gradient(90deg, transparent 0 28px, rgba(0,0,0,.25) 28px 32px)",
          backgroundBlendMode: "normal",
          animation: "scroll-x 4s linear infinite",
        }}
      />
      <div className="absolute bottom-12 left-[14%]" style={{ animation: "run-bob 0.35s steps(2) infinite" }}>
        <PixelSprite rows={[...PLAYER_TOP, ...LEGS.run1]} palette={PLAYER_PAL} size={5} className="drop-shadow-[0_0_14px_rgba(168,85,247,0.8)]" />
      </div>
      <div className="absolute bottom-12 right-[16%]" style={{ animation: "floaty 3s ease-in-out infinite" }}>
        <div className="h-16 w-8 rounded-t-lg border-2 border-indigo-400 bg-cyan-400/70 shadow-[0_0_30px_rgba(34,211,238,0.8)]" />
      </div>
    </div>
  );
}
