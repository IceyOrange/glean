/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,html}"],
  theme: {
    extend: {
      // Colors read from CSS variable channels (defined in src/styles/tailwind.css)
      // so light/dark themes are a single media-query swap.
      colors: {
        // Warm paper neutrals — tinted, never pure gray/black/white
        paper: "oklch(var(--paper) / <alpha-value>)",
        surface: "oklch(var(--surface) / <alpha-value>)",
        ink: {
          900: "oklch(var(--ink-900) / <alpha-value>)",
          600: "oklch(var(--ink-600) / <alpha-value>)",
          400: "oklch(var(--ink-400) / <alpha-value>)",
          300: "oklch(var(--ink-300) / <alpha-value>)",
        },
        line: {
          DEFAULT: "oklch(var(--line) / <alpha-value>)",
          soft: "oklch(var(--line-soft) / <alpha-value>)",
        },
        // Seal red — the single strong accent
        seal: {
          DEFAULT: "oklch(var(--seal) / <alpha-value>)",
          soft: "oklch(var(--seal-soft) / <alpha-value>)",
        },
        ochre: "oklch(var(--ochre) / <alpha-value>)",
        sage: "oklch(var(--sage) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          "sans-serif",
        ],
        quote: [
          "Literata",
          "Georgia",
          '"Songti SC"',
          '"Noto Serif CJK SC"',
          "serif",
        ],
      },
    },
  },
  plugins: [],
};
