import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./frontend/**/*.{js,ts,jsx,tsx,mdx}",
    "./backend/**/*.{js,ts,jsx,tsx,mdx}",
    "./shared/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "var(--ink-950)",
          900: "var(--ink-900)",
          850: "var(--ink-850)"
        },
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)"
        },
        border: {
          subtle: "var(--border-subtle)",
          active: "var(--border-active)"
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)"
        },
        glow: {
          indigo: "var(--glow-indigo)",
          violet: "var(--glow-violet)",
          cyan: "var(--glow-cyan)",
          mint: "var(--glow-mint)"
        }
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        medium: "var(--motion-medium)",
        slow: "var(--motion-slow)"
      },
      transitionTimingFunction: {
        innkwise: "var(--motion-ease)"
      },
      boxShadow: {
        "innkwise-glow": "var(--glow-shadow)",
        "inner-highlight": "var(--inner-highlight)"
      }
    }
  },
  plugins: []
};

export default config;
