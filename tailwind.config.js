/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{js,ts,jsx,tsx,html}"],
  theme: {
    extend: {
      colors: {
        specter: {
          bg: "#0d0f14",
          surface: "#141820",
          border: "#1e2433",
          accent: "#6366f1",
          "accent-hover": "#818cf8",
          muted: "#4b5563",
          text: "#e2e8f0",
          dim: "#94a3b8",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
