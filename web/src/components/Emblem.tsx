/**
 * PLACEHOLDER EMBLEM. Swap this one file when the final symbol is approved.
 *
 * Symbol only (no letter, no monogram), after the engine repo's placeholder
 * crow: a faceted crow head in profile, cut from flat planes like folded sheet
 * metal. Uses currentColor plus one violet facet so it works on every theme.
 */
export function Emblem({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* skull */}
      <path d="M9 7.5 18.5 4 27 10.5 25 22 15.5 28 11 20.5z" fill="currentColor" />
      {/* crown facet */}
      <path d="M9 7.5 18.5 4 20.5 10.5 13 13z" fill="var(--accent-fill)" />
      {/* beak */}
      <path d="M11 20.5 13 13 2.5 16.5z" fill="currentColor" opacity="0.62" />
      {/* eye */}
      <path d="M19.2 12.6h2.6v2.6h-2.6z" fill="var(--ground)" />
    </svg>
  );
}
