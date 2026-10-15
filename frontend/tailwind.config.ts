import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0f14",
        foreground: "#f1f5f9",
        clinical: {
          bg: "#0b0f14",
          surface: "#101620",
          card: "#141c29",
          cardHover: "#182333",
          border: "#1e293b",
          borderSubtle: "#182232",
          muted: "#64748b",
          teal: "#2dd4bf",
          tealGlow: "rgba(45, 212, 191, 0.15)",
          amber: "#f59e0b",
          amberGlow: "rgba(245, 158, 11, 0.15)",
          red: "#ef4444",
          redGlow: "rgba(239, 68, 68, 0.15)",
          blue: "#38bdf8",
          purple: "#a855f7",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 4px 20px -2px rgba(0, 0, 0, 0.5)",
        glowTeal: "0 0 25px -5px rgba(45, 212, 191, 0.25)",
        glowAmber: "0 0 25px -5px rgba(245, 158, 11, 0.25)",
        glowRed: "0 0 25px -5px rgba(239, 68, 68, 0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
