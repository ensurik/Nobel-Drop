/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0A0A0B",
          800: "#15151A",
          700: "#1F1F26",
          600: "#2A2A33",
          500: "#3A3A44",
        },
        bone: {
          100: "#F5F2EA",
          200: "#E8E3D5",
          300: "#C9C2AE",
          400: "#8E8B82",
        },
        gold: {
          DEFAULT: "#C8A24C",
          bright: "#E8C57A",
          dim: "#7A6532",
          deep: "#473A1A",
        },
        danger: "#D4503E",
        success: "#5BAE7A",
      },
      fontFamily: {
        display: ["PlayfairDisplay_700Bold"],
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_500Medium"],
        "sans-bold": ["Inter_700Bold"],
      },
    },
  },
  plugins: [],
};
