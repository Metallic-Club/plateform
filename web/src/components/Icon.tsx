import type { SVGProps } from "react";
import {
  ArrowSquareOut,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  CoatHanger,
  Compass,
  Copy,
  DownloadSimple,
  FunnelSimple,
  Heart,
  Hourglass,
  House,
  Link,
  List,
  MagnifyingGlass,
  Monitor,
  PencilRuler,
  Play,
  Plus,
  SlidersHorizontal,
  Tag,
  ThumbsDown,
  ThumbsUp,
  User,
  Users,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react/lib";

/*
 * Icons are Phosphor (MIT, @phosphor-icons/react), the set Studio and the
 * Launcher use, so the platform has one icon voice. Regular weight everywhere;
 * Fill only for a state that is on (a favourited heart). No Bold.
 * The /ssr build has no React context, so it renders in server and client
 * components alike.
 */
const icons = {
  home: [House, "regular"],
  explore: [Compass, "regular"],
  wardrobe: [CoatHanger, "regular"],
  marketplace: [Tag, "regular"],
  search: [MagnifyingGlass, "regular"],
  friends: [Users, "regular"],
  user: [User, "regular"],
  play: [Play, "regular"],
  heart: [Heart, "regular"],
  heartFilled: [Heart, "fill"],
  thumbUp: [ThumbsUp, "regular"],
  thumbDown: [ThumbsDown, "regular"],
  sliders: [SlidersHorizontal, "regular"],
  close: [X, "regular"],
  menu: [List, "regular"],
  download: [DownloadSimple, "regular"],
  chevronRight: [CaretRight, "regular"],
  chevronLeft: [CaretLeft, "regular"],
  chevronDown: [CaretDown, "regular"],
  plus: [Plus, "regular"],
  check: [Check, "regular"],
  progress: [Hourglass, "regular"],
  external: [ArrowSquareOut, "regular"],
  create: [PencilRuler, "regular"],
  link: [Link, "regular"],
  device: [Monitor, "regular"],
  filter: [FunnelSimple, "regular"],
  copy: [Copy, "regular"],
} as const satisfies Record<string, readonly [PhosphorIcon, IconWeight]>;

export type IconName = keyof typeof icons;

export function Icon({
  name,
  size = 20,
  label,
  ...rest
}: { name: IconName; size?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, "name" | "ref">) {
  const [Glyph, weight] = icons[name];
  return (
    <Glyph
      size={size}
      weight={weight}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    />
  );
}
