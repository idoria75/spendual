import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        fg: v("fg"),
        muted: v("muted"),
        line: v("line"),
        accent: v("accent"),
        "accent-fg": v("accent-fg"),
        pos: v("pos"),
        warn: v("warn"),
        err: v("err"),
      },
      fontFamily: {
        sans: ['"Figtree"', "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
      },
      borderRadius: { tile: "8px", input: "10px", card: "14px", sheet: "20px", chip: "999px" },
    },
  },
} satisfies Config;
