/** The contrast figures written into globals.css. Measured against the colour
 *  the text ACTUALLY SITS ON, never the page behind it — the mistake day 2 of
 *  this run shipped with the passing figures written beside it. */
const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/* One scheme. The site committed to the light page, so there is one palette to
   measure and no second set of figures to drift. */
const THEMES = {
  light: { ground: "#ffffff", surface: "#faf9f6", ink: "#16171a", muted: "#55565a", faint: "#6f7075", loud: "#b3312a", warn: "#8a5a09", link: "#1b4fb0", live: "#1f7a44" },
};
let worst = 99;
for (const [theme, t] of Object.entries(THEMES)) {
  for (const key of ["ink", "muted", "faint", "loud", "warn", "link", "live"] as const) {
    const g = ratio(t[key], t.ground), s = ratio(t[key], t.surface);
    worst = Math.min(worst, g, s);
    console.log(`${theme.padEnd(6)} ${key.padEnd(6)} ${t[key]}  ground ${g.toFixed(2).padStart(5)}  surface ${s.toFixed(2).padStart(5)}  ${Math.min(g, s) >= 4.5 ? "AA" : "FAILS AA"}`);
  }
}
console.log(`\nworst pair: ${worst.toFixed(2)}:1 ${worst >= 4.5 ? "— passes AA" : "— FAILS AA"}`);
process.exitCode = worst >= 4.5 ? 0 : 1;
