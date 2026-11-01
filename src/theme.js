// Theme ids must match the [data-theme] blocks in features.css.
export const themes = [
  { id: 'charcoal', name: 'Charcoal', note: 'The default Metallic palette: neutral surfaces, bright monochrome controls.' },
  { id: 'slate', name: 'Slate', note: 'Cooler surfaces and a pale blue accent for long sessions.' },
  { id: 'ember', name: 'Ember', note: 'Warm browns and an amber accent for night-time play.' },
];
export const themeIds = themes.map(theme => theme.id);
export const isTheme = value => themeIds.includes(value);
export function applyTheme(state, root = typeof document === 'undefined' ? null : document.documentElement) {
  if (!root) return 'charcoal';
  const theme = isTheme(state.theme) ? state.theme : 'charcoal';
  root.dataset.theme = theme;
  return theme;
}
