import type { SVGProps } from "react";

/*
 * Metallic's own icon set. Square line caps and mitred joins on a 20px grid,
 * so the glyphs read as cut, not drawn: the same idea as the milled corner.
 */

const paths = {
  home: (
    <>
      <path d="M3 9.5 10 3.5l7 6V17H3z" />
      <path d="M8 17v-5h4v5" />
    </>
  ),
  explore: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m12.8 7.2-1.6 4-4 1.6 1.6-4z" />
    </>
  ),
  wardrobe: (
    <>
      <path d="M8.2 5.6A1.9 1.9 0 1 1 10 7.4v1.4" />
      <path d="M10 8.8 2.8 14.6h14.4z" />
    </>
  ),
  marketplace: (
    <>
      <path d="M3 3h7l7 7-7 7-7-7z" />
      <circle cx="7" cy="7" r="1.2" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m12.6 12.6 4.4 4.4" />
    </>
  ),
  friends: (
    <>
      <circle cx="7.5" cy="7" r="3" />
      <path d="M2 17c.4-3 2.6-5 5.5-5s5.1 2 5.5 5" />
      <path d="M12.5 4.2a3 3 0 0 1 0 5.6M14.6 12.4c1.8.8 3 2.4 3.3 4.6" />
    </>
  ),
  user: (
    <>
      <circle cx="10" cy="7" r="3.5" />
      <path d="M3.5 17.5c.5-3.4 3.1-5.5 6.5-5.5s6 2.1 6.5 5.5" />
    </>
  ),
  play: <path d="M6 3.5v13l10-6.5z" fill="currentColor" stroke="none" />,
  heart: <path d="M10 16.5S3 12.4 3 7.6A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 7 1.6c0 4.8-7 8.9-7 8.9z" />,
  heartFilled: (
    <path d="M10 16.5S3 12.4 3 7.6A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 7 1.6c0 4.8-7 8.9-7 8.9z" fill="currentColor" />
  ),
  thumbUp: (
    <>
      <path d="M3 9h3v8H3z" />
      <path d="M6 9l3.5-6c1.3 0 2 .9 1.8 2.2L10.8 8H16l-1.6 9H6" />
    </>
  ),
  thumbDown: (
    <>
      <path d="M3 3h3v8H3z" />
      <path d="M6 11l3.5 6c1.3 0 2-.9 1.8-2.2l-.5-2.8H16l-1.6-9H6" />
    </>
  ),
  sliders: (
    <>
      <path d="M3 5h14M3 10h14M3 15h14" />
      <path d="M12 3v4M6 8v4M13 13v4" />
    </>
  ),
  close: <path d="m4.5 4.5 11 11m0-11-11 11" />,
  menu: <path d="M3 5.5h14M3 10h14M3 14.5h14" />,
  download: (
    <>
      <path d="M10 3v9m-4-4 4 4 4-4" />
      <path d="M3.5 13.5V17h13v-3.5" />
    </>
  ),
  chevronRight: <path d="m7.5 4 6 6-6 6" />,
  chevronLeft: <path d="m12.5 4-6 6 6 6" />,
  chevronDown: <path d="m4 7.5 6 6 6-6" />,
  plus: <path d="M10 3.5v13M3.5 10h13" />,
  check: <path d="m3.5 10.5 4 4 9-9" />,
  signal: (
    <>
      <path d="M4 16v-3M8 16v-6M12 16V7M16 16V4" />
    </>
  ),
  external: (
    <>
      <path d="M11 3.5h5.5V9" />
      <path d="M16.5 3.5 9 11" />
      <path d="M14 12v4.5H3.5V6H8" />
    </>
  ),
  create: (
    <>
      <path d="M3 17 3 3l14 14z" />
      <path d="M6 12.5V14h1.5" />
    </>
  ),
  link: (
    <>
      <path d="M8.5 11.5 11.5 8.5" />
      <path d="M9.5 5.5 11 4a3.2 3.2 0 0 1 4.5 4.5L14 10M10.5 14.5 9 16a3.2 3.2 0 0 1-4.5-4.5L6 10" />
    </>
  ),
  device: (
    <>
      <path d="M2.5 4h15v9.5h-15z" />
      <path d="M7 17h6M10 13.5V17" />
    </>
  ),
  filter: <path d="M3 5h14M5.5 10h9M8 15h4" />,
  copy: (
    <>
      <path d="M7 7h10v10H7z" />
      <path d="M13 7V3H3v10h4" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  label,
  ...rest
}: { name: IconName; size?: number; label?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
