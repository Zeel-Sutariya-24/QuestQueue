/** Renders a string-grid pixel sprite as crisp SVG (used by the logo and hero art). */
export default function PixelSprite({
  rows,
  palette,
  size = 4,
  className = "",
}: {
  rows: string[];
  palette: Record<string, string>;
  size?: number;
  className?: string;
}) {
  const w = rows[0].length;
  const rects: { x: number; y: number; c: string }[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = palette[row[x]];
      if (c) rects.push({ x, y, c });
    }
  });
  return (
    <svg
      width={w * size}
      height={rows.length * size}
      viewBox={`0 0 ${w} ${rows.length}`}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1} height={1} fill={r.c} />
      ))}
    </svg>
  );
}
