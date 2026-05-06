/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#050507",
          900: "#0A0A0B",
          850: "#0F0F12",
          800: "#15151A",
          700: "#1F1F26",
          600: "#2A2A33",
          500: "#3A3A44",
          400: "#4F4F5C",
        },
        bone: {
          50: "#FBFAF6",
          100: "#F5F2EA",
          200: "#E8E3D5",
          300: "#C9C2AE",
          400: "#8E8B82",
          500: "#5C5A55",
        },
        gold: {
          DEFAULT: "#C8A24C",
          50: "#FBF6E8",
          100: "#F4E8C2",
          200: "#E8C57A",
          300: "#D8B25E",
          400: "#C8A24C",
          500: "#B08A3A",
          600: "#7A6532",
          700: "#473A1A",
          800: "#2C2310",
        },
        ember: "#D4503E",
        moss: "#5BAE7A",
      },
      fontFamily: {
        display: ['"Playfair Display"', "ui-serif", "Georgia", "serif"],
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      letterSpacing: {
        "ultra-wide": "0.32em",
      },
      maxWidth: {
        "8xl": "88rem",
        "9xl": "104rem",
      },
      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, rgba(232,197,122,0) 0%, rgba(232,197,122,0.18) 35%, rgba(200,162,76,0.05) 50%, rgba(232,197,122,0.18) 65%, rgba(232,197,122,0) 100%)",
        "ink-vignette":
          "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)",
        "hairline-grid":
          "linear-gradient(to right, rgba(200,162,76,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(200,162,76,0.06) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-1": "96px 96px",
      },
      animation: {
        "fade-up": "fadeUp 1.1s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fadeIn 1.4s ease-out both",
        shimmer: "shimmer 8s linear infinite",
        "pulse-soft": "pulseSoft 4s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translate3d(0,24px,0)" },
          "100%": { opacity: "1", transform: "translate3d(0,0,0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
