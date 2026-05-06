/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        // Cream — warm light backgrounds (anti dark-web)
        cream: {
          50: "#FBF8F2",
          100: "#F5F0E6",
          200: "#EDE6D6",
          300: "#E0D5BD",
          400: "#C9BC9D",
        },
        // Espresso — primary text and dark accents
        espresso: {
          950: "#0F0A06",
          900: "#1A1410",
          800: "#241B14",
          700: "#3A2F22",
          600: "#54473A",
          500: "#6F5F4A",
          400: "#8C7C66",
        },
        // Cocoa — secondary warm dark
        cocoa: {
          900: "#2A1A0F",
          800: "#3A2317",
          700: "#5A3D27",
          600: "#7A5538",
        },
        // Brass — primary accent (muted, not blingy)
        brass: {
          DEFAULT: "#A37D2E",
          50: "#F8F1DF",
          100: "#EFE0BB",
          200: "#DCC18C",
          300: "#C9A56A",
          400: "#B5904A",
          500: "#A37D2E",
          600: "#8B6722",
          700: "#6B4F1A",
          800: "#473312",
        },
        blush: {
          100: "#F5E8DC",
          200: "#E8D4C0",
        },
        ember: "#B8462E",
        moss: "#5C7A4A",
      },
      fontFamily: {
        display: [
          '"Fraunces Variable"',
          "Fraunces",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        sans: [
          '"Inter Variable"',
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
        "ultra-wide": "0.28em",
      },
      maxWidth: {
        "8xl": "88rem",
        "9xl": "104rem",
        prose: "65ch",
      },
      backgroundImage: {
        "paper-grain":
          "radial-gradient(ellipse 800px 600px at 20% 10%, rgba(184,158,109,0.05) 0%, transparent 50%), radial-gradient(ellipse 600px 400px at 80% 80%, rgba(90,61,39,0.04) 0%, transparent 50%)",
      },
      animation: {
        "fade-up": "fadeUp 1.0s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fadeIn 1.2s ease-out both",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translate3d(0,16px,0)" },
          "100%": { opacity: "1", transform: "translate3d(0,0,0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
