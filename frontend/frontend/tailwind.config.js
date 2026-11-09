/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#060a0f",
        panel: "rgba(12, 19, 27, 0.78)",
        line: "rgba(148, 163, 184, 0.18)",
        cyanSignal: "#22d3ee",
        stable: "#22c55e",
        uncertain: "#f59e0b",
        risk: "#ef4444",
      },
      boxShadow: {
        glow: "0 0 32px rgba(34, 211, 238, 0.18)",
        panel: "0 20px 70px rgba(0, 0, 0, 0.32)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
