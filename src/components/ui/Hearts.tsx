export default function Hearts({ lives, max, size = 18 }: { lives: number; max: number; size?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label={`${lives} of ${max} lives`}>
      {Array.from({ length: max }).map((_, i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 9 8"
          shapeRendering="crispEdges"
          className={i < lives ? "drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]" : "opacity-30"}
        >
          {[
            [1, 0], [2, 0], [4, 0], [5, 0],
            [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
            [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2],
            [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
            [2, 4], [3, 4], [4, 4],
            [3, 5],
          ].map(([x, y], j) => (
            <rect key={j} x={x + 1} y={y} width={1} height={1} fill={i < lives ? "#f43f5e" : "#64748b"} />
          ))}
          {i < lives && <rect x={2} y={1} width={1} height={1} fill="#fda4af" />}
        </svg>
      ))}
    </div>
  );
}
