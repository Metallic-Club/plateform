import type { ReactNode } from "react";
import type { GameArt as Art } from "@/lib/api/types";

/*
 * Procedural thumbnails. Every sample game is drawn from its scene, palette
 * and seed: flat shapes, no gradients, no text, so the art reads as one
 * illustration language until creators upload their own images.
 * Rendered on the server as inline SVG: no image requests, sharp at any size.
 */

const W = 320;
const H = 200;

type P = Art["palette"];
type Rand = () => number;

function rng(seed: number): Rand {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

function wave(r: Rand, base: number, amp: number, segments: number) {
  const step = W / segments;
  let d = `M0 ${f(base + (r() - 0.5) * amp)} Q${f(step / 2)} ${f(base - amp * (r() * 2 - 1))} ${f(step)} ${f(base + (r() - 0.5) * amp)}`;
  for (let i = 2; i <= segments; i++) d += ` T${f(step * i)} ${f(base + (r() - 0.5) * amp * 1.4)}`;
  return `${d} L${W} ${H} L0 ${H}Z`;
}

function ridge(r: Rand, base: number, height: number, peaks: number) {
  const pts: [number, number][] = [[0, base]];
  const step = W / peaks;
  for (let i = 0; i < peaks; i++) {
    const x = step * i + step * (0.3 + r() * 0.4);
    pts.push([x, base - height * (0.45 + r() * 0.55)]);
    pts.push([step * (i + 1), base - height * r() * 0.25]);
  }
  pts.push([W, H], [0, H]);
  return pts;
}

const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

/* ------------------------------------------------------------------ scenes */

function dunes(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      <circle cx={f(50 + r() * 220)} cy={f(46 + r() * 26)} r={20} fill={detail} />
      <path d={wave(r, 112, 26, 3)} fill={far} />
      <path d={wave(r, 140, 24, 3)} fill={mid} />
      <path d={wave(r, 172, 18, 2)} fill={near} />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={f(60 + i * 18 + r() * 4)} y={f(182 - i * 2.2 + (i % 2) * 3)} width={3} height={2} fill={mid} />
      ))}
    </>
  );
}

function tree(x: number, base: number, h: number, w: number, fill: string, key: string) {
  return (
    <g key={key} fill={fill}>
      <polygon points={poly([[x, base - h], [x - w / 2, base - h * 0.35], [x + w / 2, base - h * 0.35]])} />
      <polygon points={poly([[x, base - h * 0.7], [x - w * 0.62, base], [x + w * 0.62, base]])} />
    </g>
  );
}

function forest(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const rows: ReactNode[] = [];
  for (let i = 0; i < 16; i++) rows.push(tree(i * 21 + r() * 10, 130, 40 + r() * 24, 18, far, `f${i}`));
  for (let i = 0; i < 9; i++) rows.push(tree(i * 38 + r() * 14, 162, 70 + r() * 30, 30, mid, `m${i}`));
  const lx = 110 + r() * 100;
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      <circle cx={f(40 + r() * 240)} cy={34} r={15} fill={detail} opacity={0.9} />
      {rows}
      <rect y={158} width={W} height={42} fill={near} />
      <circle cx={f(lx)} cy={170} r={26} fill={detail} opacity={0.14} />
      <rect x={f(lx - 3)} y={164} width={6} height={9} fill={detail} />
      {tree(-6, 210, 190, 56, near, "n1")}
      {tree(W + 4, 214, 200, 60, near, "n2")}
    </>
  );
}

function city(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const out: ReactNode[] = [];
  let x = -6;
  while (x < W) {
    const w = 16 + r() * 22;
    const h = 50 + r() * 60;
    out.push(<rect key={`f${x}`} x={f(x)} y={f(150 - h)} width={f(w)} height={f(h + 50)} fill={far} />);
    x += w + 2;
  }
  x = -4;
  let i = 0;
  const tower = Math.floor(r() * 5) + 2;
  while (x < W) {
    const w = 26 + r() * 26;
    const h = i === tower ? 120 : 34 + r() * 52;
    const top = 170 - h;
    out.push(<rect key={`m${i}`} x={f(x)} y={f(top)} width={f(w)} height={f(h + 30)} fill={mid} />);
    if (i === tower) {
      out.push(
        <polygon key={`roof${i}`} points={poly([[x - 2, top], [x + w / 2, top - 26], [x + w + 2, top]])} fill={mid} />,
        <circle key={`clock${i}`} cx={f(x + w / 2)} cy={f(top + 18)} r={8} fill={detail} />,
      );
    }
    for (let wy = top + (i === tower ? 36 : 8); wy < 160; wy += 10) {
      for (let wx = x + 5; wx < x + w - 6; wx += 8) {
        if (r() < 0.32) out.push(<rect key={`w${i}-${f(wx)}-${f(wy)}`} x={f(wx)} y={f(wy)} width={4} height={5} fill={detail} />);
      }
    }
    x += w + 4;
    i++;
  }
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      {out}
      <path d={`M0 172 L${W} 166 L${W} ${H} L0 ${H}Z`} fill={near} />
      {Array.from({ length: 6 }, (_, k) => (
        <rect key={k} x={f(20 + k * 52 + r() * 10)} y={156 - k} width={8} height={14} fill={near} />
      ))}
    </>
  );
}

function orbit(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const cx = 210 + r() * 50;
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      {Array.from({ length: 34 }, (_, i) => (
        <rect key={i} x={f(r() * W)} y={f(r() * H)} width={1.6} height={1.6} fill={detail} opacity={f(0.35 + r() * 0.6)} />
      ))}
      <circle cx={f(60 + r() * 40)} cy={f(50 + r() * 20)} r={13} fill={far} />
      <circle cx={f(cx)} cy={170} r={104} fill={mid} />
      <circle cx={f(cx + 26)} cy={182} r={98} fill={sky} opacity={0.28} />
      <ellipse cx={f(cx)} cy={150} rx={160} ry={26} fill="none" stroke={near} strokeWidth={5} transform={`rotate(-12 ${f(cx)} 150)`} />
      <g transform={`translate(${f(110 + r() * 40)} ${f(70 + r() * 20)}) rotate(-24)`}>
        <polygon points="0,-5 16,0 0,5 3,0" fill={near} />
        <path d="M-2 0 H-38" stroke={detail} strokeWidth={1.4} strokeDasharray="3 4" />
      </g>
    </>
  );
}

function sea(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const sx = 70 + r() * 150;
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      {[0, 1, 2].map((i) => {
        const x = 40 + i * 100 + r() * 30;
        return <polygon key={i} points={poly([[x, 0], [x + 26, 0], [x + 70, H], [x + 20, H]])} fill={detail} opacity={0.08} />;
      })}
      <path d={wave(r, 150, 16, 3)} fill={far} />
      <g fill={mid}>
        <rect x={f(sx)} y={110} width={74} height={40} />
        <circle cx={f(sx + 22)} cy={110} r={20} />
        <rect x={f(sx + 66)} y={124} width={46} height={18} />
        <rect x={f(sx + 10)} y={148} width={6} height={30} />
        <rect x={f(sx + 58)} y={148} width={6} height={30} />
      </g>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={f(sx + 36 + i * 13)} cy={130} r={3.6} fill={detail} />
      ))}
      <rect x={f(sx + 14)} y={104} width={16} height={5} fill={detail} />
      {Array.from({ length: 9 }, (_, i) => {
        const x = i * 38 + r() * 20;
        const h = 60 + r() * 70;
        const d = `M${f(x)} ${H} Q${f(x - 10)} ${f(H - h / 2)} ${f(x + 4)} ${f(H - h * 0.75)} T${f(x + 2)} ${f(H - h)}`;
        return <path key={i} d={d} stroke={i % 2 ? near : far} strokeWidth={5} fill="none" strokeLinecap="round" />;
      })}
      <path d={wave(r, 186, 8, 4)} fill={near} />
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={f(sx + 30 + r() * 30)} cy={f(30 + i * 12 + r() * 6)} r={f(1.5 + r() * 2.5)} fill="none" stroke={detail} strokeWidth={1.2} opacity={0.7} />
      ))}
    </>
  );
}

function platforms(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const blocks: ReactNode[] = [];
  for (let i = 0; i < 9; i++) {
    const w = 18 + r() * 22;
    blocks.push(<rect key={`b${i}`} x={f(i * 36 + r() * 10)} y={f(70 + r() * 70)} width={f(w)} height={f(w * 0.45)} fill={far} />);
  }
  const big: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) big.push([12 + i * 64 + r() * 18, 160 - i * 14 - r() * 26 + (i % 2) * 22, 34 + r() * 24]);
  const [fx, fy, fw] = big[2];
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      <circle cx={f(220 + r() * 50)} cy={f(46 + r() * 16)} r={34} fill={detail} />
      {blocks}
      {big.map(([x, y, w], i) => (
        <g key={`p${i}`} transform={`rotate(${f((r() - 0.5) * 6)} ${f(x + w / 2)} ${f(y)})`}>
          <rect x={f(x)} y={f(y)} width={f(w)} height={14} fill={mid} />
          <rect x={f(x)} y={f(y + 14)} width={f(w)} height={7} fill={near} />
        </g>
      ))}
      <rect x={f(fx + fw / 2 - 3)} y={f(fy - 14)} width={6} height={14} fill={near} />
      <rect x={f(fx + fw / 2 - 3.5)} y={f(fy - 22)} width={7} height={7} fill={near} />
    </>
  );
}

function track(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const bend = (r() - 0.5) * 140;
  const hx = 170 + bend * 0.4;
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      <polygon points={poly(ridge(r, 96, 30, 4))} fill={far} />
      <rect y={92} width={W} height={H} fill={mid} />
      <path d={`M${f(hx - 3)} 92 Q${f(hx + bend)} 140 ${f(60)} ${H} L${f(250)} ${H} Q${f(hx + bend + 40)} 140 ${f(hx + 3)} 92Z`} fill={near} />
      <path d={`M${f(hx)} 94 Q${f(hx + bend + 20)} 140 ${f(155)} ${H}`} stroke={detail} strokeWidth={2.4} strokeDasharray="9 9" fill="none" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={f(20 + i * 12)} y={f(170 + i * 0.5)} width={6} height={30} fill={i % 2 ? detail : sky} transform={`skewX(-30)`} />
      ))}
    </>
  );
}

function blocks(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const s = 17;
  const ox = W / 2;
  const oy = 70;
  const cubes: { i: number; j: number; k: number; accent: boolean }[] = [];
  const accentAt = Math.floor(r() * 25);
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const h = Math.floor(r() * r() * 5) + 1;
      for (let k = 0; k < h; k++) cubes.push({ i, j, k, accent: i * 5 + j === accentAt && k === h - 1 });
    }
  cubes.sort((a, b) => a.i + a.j - (b.i + b.j) || a.k - b.k);
  const cx = (i: number, j: number) => ox + (i - j) * s * 0.866;
  const cy = (i: number, j: number, k: number) => oy + (i + j) * s * 0.5 - k * s;
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      <rect y={150} width={W} height={50} fill={far} opacity={0.6} />
      {cubes.map(({ i, j, k, accent }) => {
        const x = cx(i, j);
        const y = cy(i, j, k);
        const top = poly([[x, y - s], [x + s * 0.866, y - s * 0.5], [x, y], [x - s * 0.866, y - s * 0.5]]);
        const left = poly([[x - s * 0.866, y - s * 0.5], [x, y], [x, y + s], [x - s * 0.866, y + s * 0.5]]);
        const right = poly([[x + s * 0.866, y - s * 0.5], [x, y], [x, y + s], [x + s * 0.866, y + s * 0.5]]);
        return (
          <g key={`${i}-${j}-${k}`}>
            <polygon points={top} fill={accent ? detail : far} />
            <polygon points={left} fill={mid} />
            <polygon points={right} fill={near} />
          </g>
        );
      })}
    </>
  );
}

function peaks(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const back = ridge(r, 132, 96, 3);
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      <circle cx={f(40 + r() * 240)} cy={f(36 + r() * 14)} r={14} fill={detail} opacity={0.85} />
      <polygon points={poly(back)} fill={far} />
      {back
        .filter((_, i) => i % 2 === 1 && i < back.length - 2)
        .map(([x, y], i) => (
          <polygon key={i} points={poly([[x, y], [x - 12, y + 16], [x - 4, y + 12], [x + 3, y + 18], [x + 12, y + 15]])} fill={detail} />
        ))}
      <polygon points={poly(ridge(r, 162, 70, 4))} fill={mid} />
      <polygon points={poly(ridge(r, 190, 40, 5))} fill={near} />
    </>
  );
}

function arena(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const n = 6;
  const s = 22;
  const ox = W / 2 - (n * s) / 2;
  const oy = H / 2 - (n * s) / 2;
  const tiles: ReactNode[] = [];
  const pieces: ReactNode[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1;
      if (edge && r() < 0.28) continue;
      tiles.push(<rect key={`${i}${j}`} x={ox + i * s + 1} y={oy + j * s + 1} width={s - 2} height={s - 2} fill={(i + j) % 2 ? mid : far} />);
      if (r() < 0.12) {
        const accent = r() < 0.5;
        pieces.push(<rect key={`p${i}${j}`} x={ox + i * s + 6} y={oy + j * s + 6} width={10} height={10} fill={accent ? detail : near} />);
      }
    }
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      <polygon points={poly([[ox - 14, oy + 10], [ox + 10, oy - 14], [ox + n * s - 10, oy - 14], [ox + n * s + 14, oy + 10], [ox + n * s + 14, oy + n * s - 10], [ox + n * s - 10, oy + n * s + 14], [ox + 10, oy + n * s + 14], [ox - 14, oy + n * s - 10]])} fill={near} />
      {tiles}
      {pieces}
    </>
  );
}

function garden(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const gx = 50 + r() * 60;
  const gw = 200;
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      <path d={wave(r, 150, 14, 3)} fill={far} />
      <polygon points={poly([[gx, 170], [gx, 96], [gx + gw / 2, 56], [gx + gw, 96], [gx + gw, 170]])} fill={detail} opacity={0.75} />
      <g stroke={mid} strokeWidth={3}>
        <polyline points={poly([[gx, 170], [gx, 96], [gx + gw / 2, 56], [gx + gw, 96], [gx + gw, 170]])} fill="none" />
        {[1, 2, 3, 4].map((i) => (
          <line key={i} x1={gx + (gw / 5) * i} y1={170} x2={gx + (gw / 5) * i} y2={96 - (i <= 2 ? i : 5 - i) * 16} />
        ))}
        <line x1={gx} y1={96} x2={gx + gw} y2={96} />
      </g>
      {Array.from({ length: 14 }, (_, i) => {
        const x = gx + 10 + (i * (gw - 20)) / 13;
        const h = 14 + r() * 26;
        return (
          <g key={i} fill={i % 3 ? near : mid}>
            <ellipse cx={f(x)} cy={f(170 - h / 2)} rx={7} ry={f(h / 2)} />
          </g>
        );
      })}
      <rect y={168} width={W} height={32} fill={near} />
    </>
  );
}

function rooms(p: P, r: Rand) {
  const [sky, far, mid, near, detail] = p;
  const bx = 100 + r() * 30;
  const by = 44;
  const bw = 120;
  const bh = 86;
  return (
    <>
      <rect width={W} height={H} fill={near} />
      <polygon points={poly([[0, 0], [W, 0], [bx + bw, by], [bx, by]])} fill={mid} />
      <polygon points={poly([[0, H], [W, H], [bx + bw, by + bh], [bx, by + bh]])} fill={mid} opacity={0.75} />
      <rect x={f(bx)} y={by} width={bw} height={bh} fill={far} />
      <rect x={f(bx + bw * 0.58)} y={by + 22} width={30} height={64} fill={near} />
      <rect x={f(bx + bw * 0.58 + 24)} y={by + 52} width={3} height={3} fill={sky} />
      <rect x={f(bx + 16)} y={by + 18} width={34} height={24} fill={sky} />
      <line x1={f(bx + bw / 2)} y1={0} x2={f(bx + bw / 2)} y2={22} stroke={near} strokeWidth={2} />
      <polygon points={poly([[bx + bw / 2 - 12, 32], [bx + bw / 2 + 12, 32], [bx + bw / 2 + 6, 22], [bx + bw / 2 - 6, 22]])} fill={detail} />
      <g transform={`translate(${f(bx - 30 + r() * 20)} 150)`}>
        <rect width={46} height={26} fill={detail} />
        <rect x={6} y={6} width={14} height={14} fill={near} />
        <rect x={26} y={8} width={14} height={3} fill={near} />
        <rect x={26} y={14} width={10} height={3} fill={near} />
        <line x1={40} y1={0} x2={52} y2={-22} stroke={detail} strokeWidth={2} />
      </g>
    </>
  );
}

const scenes = { dunes, forest, city, orbit, sea, platforms, track, blocks, peaks, arena, garden, rooms };

export function GameArt({ art, className, label }: { art: Art; className?: string; label?: string }) {
  const draw = scenes[art.scene] ?? dunes;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {draw(art.palette, rng(art.seed))}
    </svg>
  );
}
