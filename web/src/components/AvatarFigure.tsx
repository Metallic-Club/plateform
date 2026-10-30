import type { ReactNode } from "react";
import type { AvatarLook, ItemArt, ItemSlot } from "@/lib/api/types";

/*
 * Blocky avatar renderer used by profiles, friends, wardrobe and catalog art.
 * It stands in for real 3D renders from the engine. Shapes are flat; each item
 * is drawn from its slot, shape key and two colours.
 */

const DEFAULT_TOP = "#7a7d86";
const DEFAULT_BOTTOM = "#4d5058";

type Part = (a: ItemArt, skin: string) => ReactNode;

const tops: Record<string, Part> = {
  tee: (a, skin) => (
    <>
      <rect x={22} y={84} width={12} height={26} fill={skin} />
      <rect x={86} y={84} width={12} height={26} fill={skin} />
      <rect x={20} y={60} width={16} height={26} fill={a.primary} />
      <rect x={84} y={60} width={16} height={26} fill={a.primary} />
      <rect x={36} y={60} width={48} height={52} fill={a.primary} />
      <rect x={52} y={60} width={16} height={5} fill={a.secondary} />
    </>
  ),
  "tee-stripe": (a, skin) => (
    <>
      {tops.tee(a, skin)}
      {[68, 78, 88, 98].map((y) => (
        <rect key={y} x={36} y={y} width={48} height={4} fill={a.secondary} />
      ))}
      <rect x={20} y={70} width={16} height={4} fill={a.secondary} />
      <rect x={84} y={70} width={16} height={4} fill={a.secondary} />
    </>
  ),
  hoodie: (a) => (
    <>
      <rect x={20} y={60} width={16} height={50} fill={a.primary} />
      <rect x={84} y={60} width={16} height={50} fill={a.primary} />
      <rect x={36} y={60} width={48} height={52} fill={a.primary} />
      <rect x={44} y={92} width={32} height={12} fill={a.secondary} opacity={0.5} />
      <rect x={55} y={64} width={2} height={14} fill={a.secondary} />
      <rect x={63} y={64} width={2} height={14} fill={a.secondary} />
    </>
  ),
  jacket: (a) => (
    <>
      <rect x={20} y={60} width={16} height={50} fill={a.primary} />
      <rect x={84} y={60} width={16} height={50} fill={a.primary} />
      <rect x={36} y={60} width={48} height={52} fill={a.primary} />
      <polygon points="44,60 60,72 76,60" fill={a.secondary} />
      <rect x={59} y={70} width={2} height={42} fill={a.secondary} />
      <rect x={42} y={88} width={12} height={8} fill={a.secondary} opacity={0.6} />
      <rect x={66} y={88} width={12} height={8} fill={a.secondary} opacity={0.6} />
    </>
  ),
  vest: (a) => (
    <>
      <rect x={20} y={60} width={16} height={50} fill={a.secondary} />
      <rect x={84} y={60} width={16} height={50} fill={a.secondary} />
      <rect x={36} y={60} width={48} height={52} fill={a.secondary} />
      <rect x={36} y={60} width={20} height={52} fill={a.primary} />
      <rect x={64} y={60} width={20} height={52} fill={a.primary} />
      {[70, 84, 98].map((y) => (
        <g key={y} fill={a.secondary} opacity={0.45}>
          <rect x={39} y={y} width={13} height={9} />
          <rect x={68} y={y} width={13} height={9} />
        </g>
      ))}
    </>
  ),
};

const bottoms: Record<string, Part> = {
  trousers: (a) => (
    <>
      <rect x={36} y={110} width={48} height={8} fill={a.secondary} />
      <rect x={38} y={112} width={20} height={58} fill={a.primary} />
      <rect x={62} y={112} width={20} height={58} fill={a.primary} />
    </>
  ),
  shorts: (a, skin) => (
    <>
      <rect x={38} y={112} width={20} height={58} fill={skin} />
      <rect x={62} y={112} width={20} height={58} fill={skin} />
      <rect x={36} y={110} width={48} height={8} fill={a.secondary} />
      <rect x={37} y={112} width={22} height={28} fill={a.primary} />
      <rect x={61} y={112} width={22} height={28} fill={a.primary} />
    </>
  ),
  skirt: (a, skin) => (
    <>
      <rect x={38} y={112} width={20} height={58} fill={skin} />
      <rect x={62} y={112} width={20} height={58} fill={skin} />
      <polygon points="36,110 84,110 90,146 30,146" fill={a.primary} />
      {[42, 54, 66, 78].map((x) => (
        <rect key={x} x={x} y={114} width={2} height={32} fill={a.secondary} />
      ))}
    </>
  ),
};

const shoes: Record<string, Part> = {
  sneakers: (a) => (
    <>
      <rect x={36} y={166} width={24} height={12} fill={a.primary} />
      <rect x={60} y={166} width={24} height={12} fill={a.primary} />
      <rect x={36} y={176} width={24} height={5} fill={a.secondary} />
      <rect x={60} y={176} width={24} height={5} fill={a.secondary} />
    </>
  ),
  boots: (a) => (
    <>
      <rect x={36} y={156} width={24} height={22} fill={a.primary} />
      <rect x={60} y={156} width={24} height={22} fill={a.primary} />
      <rect x={36} y={177} width={24} height={5} fill={a.secondary} />
      <rect x={60} y={177} width={24} height={5} fill={a.secondary} />
    </>
  ),
};

const hats: Record<string, Part> = {
  beanie: (a) => (
    <>
      <path d="M38 34 Q38 8 60 8 Q82 8 82 34Z" fill={a.primary} />
      <rect x={37} y={28} width={46} height={9} fill={a.secondary} />
    </>
  ),
  cap: (a) => (
    <>
      <path d="M39 30 Q39 10 60 10 Q81 10 81 30Z" fill={a.primary} />
      <rect x={58} y={26} width={36} height={6} fill={a.secondary} />
    </>
  ),
  "cap-flat": (a) => (
    <>
      <path d="M38 30 L40 16 L80 14 L84 30Z" fill={a.primary} />
      <rect x={70} y={27} width={22} height={5} fill={a.secondary} />
    </>
  ),
  bucket: (a) => (
    <>
      <path d="M42 30 L44 10 L76 10 L78 30Z" fill={a.primary} />
      <polygon points="30,34 90,34 82,26 38,26" fill={a.secondary} />
    </>
  ),
};

const hair: Record<string, Part> = {
  crop: (a) => <rect x={40} y={16} width={40} height={9} fill={a.primary} />,
  bob: (a) => (
    <>
      <rect x={38} y={15} width={44} height={12} fill={a.primary} />
      <rect x={36} y={22} width={8} height={34} fill={a.primary} />
      <rect x={76} y={22} width={8} height={34} fill={a.primary} />
    </>
  ),
  curls: (a) => (
    <g fill={a.primary}>
      {[40, 50, 60, 70, 80].map((x) => (
        <circle key={x} cx={x} cy={19} r={7} />
      ))}
      {[28, 38, 48].map((y) => (
        <g key={y}>
          <circle cx={38} cy={y} r={6} />
          <circle cx={82} cy={y} r={6} />
        </g>
      ))}
    </g>
  ),
};

const faces: Record<string, Part> = {
  calm: (a) => (
    <g fill={a.primary}>
      <rect x={49} y={34} width={5} height={6} />
      <rect x={66} y={34} width={5} height={6} />
      <rect x={55} y={47} width={10} height={2.5} />
    </g>
  ),
  grin: (a) => (
    <g fill={a.primary}>
      <rect x={49} y={33} width={5} height={6} />
      <rect x={66} y={33} width={5} height={6} />
      <path d="M50 45 H70 Q68 53 60 53 Q52 53 50 45Z" />
    </g>
  ),
  focus: (a) => (
    <g fill={a.primary}>
      <polygon points="46,30 56,32 56,34 46,32" />
      <polygon points="74,30 64,32 64,34 74,32" />
      <rect x={49} y={36} width={6} height={4} />
      <rect x={65} y={36} width={6} height={4} />
      <rect x={54} y={48} width={12} height={2.5} />
    </g>
  ),
};

const backs: Record<string, Part> = {
  backpack: (a) => (
    <>
      <rect x={30} y={64} width={60} height={46} fill={a.secondary} />
      <rect x={32} y={60} width={56} height={10} fill={a.primary} />
    </>
  ),
  cape: (a) => <polygon points="34,60 86,60 98,160 22,160" fill={a.primary} />,
};

function pick(table: Record<string, Part>, art: ItemArt | undefined, skin: string) {
  if (!art) return null;
  const fn = table[art.shape];
  return fn ? fn(art, skin) : null;
}

const get = (look: AvatarLook, slot: ItemSlot) => look.equipped[slot];

export function AvatarFigure({
  look,
  crop = "full",
  className,
  label,
}: {
  look: AvatarLook;
  crop?: "full" | "bust";
  className?: string;
  label?: string;
}) {
  const skin = look.skin;
  const top = get(look, "top");
  const bottom = get(look, "bottom");
  return (
    <svg
      className={className}
      viewBox={crop === "bust" ? "22 4 76 76" : "0 0 120 190"}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {pick(backs, get(look, "back"), skin)}
      {/* body base */}
      <rect x={22} y={60} width={12} height={50} fill={skin} />
      <rect x={86} y={60} width={12} height={50} fill={skin} />
      <rect x={36} y={60} width={48} height={52} fill={DEFAULT_TOP} />
      <rect x={38} y={112} width={20} height={58} fill={DEFAULT_BOTTOM} />
      <rect x={62} y={112} width={20} height={58} fill={DEFAULT_BOTTOM} />
      {top ? pick(tops, top, skin) : null}
      {bottom ? pick(bottoms, bottom, skin) : null}
      {pick(shoes, get(look, "shoes"), skin) ?? (
        <>
          <rect x={36} y={168} width={24} height={12} fill="#33353b" />
          <rect x={60} y={168} width={24} height={12} fill="#33353b" />
        </>
      )}
      {/* hands */}
      <rect x={22} y={108} width={12} height={8} fill={skin} />
      <rect x={86} y={108} width={12} height={8} fill={skin} />
      {/* head */}
      <rect x={40} y={18} width={40} height={40} fill={skin} />
      {pick(hair, get(look, "hair"), skin)}
      {pick(faces, get(look, "face"), skin) ?? faces.calm({ slot: "face", shape: "calm", primary: "#1a1a1d", secondary: "#1a1a1d" }, skin)}
      {pick(hats, get(look, "hat"), skin)}
    </svg>
  );
}

/** Draws a single catalog item on its own, centred, for marketplace tiles. */
export function ItemArtView({ art, className, label }: { art: ItemArt; className?: string; label?: string }) {
  const skin = "#00000000";
  const views: Record<ItemSlot, { box: string; node: ReactNode }> = {
    top: { box: "10 50 100 72", node: pick(tops, art, "#c9a487") },
    bottom: { box: "18 104 84 84", node: pick(bottoms, art, "#c9a487") },
    shoes: { box: "26 140 68 48", node: pick(shoes, art, skin) },
    hat: { box: "24 0 72 48", node: pick(hats, art, skin) },
    hair: { box: "26 4 68 60", node: pick(hair, art, skin) },
    face: {
      box: "36 16 48 46",
      node: (
        <>
          <rect x={40} y={18} width={40} height={40} fill="#c9a487" />
          {pick(faces, art, skin)}
        </>
      ),
    },
    back: { box: "14 54 92 112", node: pick(backs, art, skin) },
  };
  const v = views[art.slot];
  return (
    <svg
      className={className}
      viewBox={v.box}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {v.node}
    </svg>
  );
}
