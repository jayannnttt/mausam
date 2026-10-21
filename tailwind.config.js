/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F3EE",
        surface: "#FFFFFF",
        ink: {
          950: "#111A1E",
          900: "#18252B", // Primary text
          800: "#27363E",
          700: "#3D4950",
          500: "#68747A", // Secondary text
          400: "#869298",
          300: "#A3ADB2",
          200: "#C7CECE",
          100: "#E4E7E5",
        },
        line: {
          DEFAULT: "#DEE2DD", // Dividers and borders
          subtle: "#EAECE8",
          strong: "#C4C9C3",
        },
        pine: {
          DEFAULT: "#35665F", // Brand accent
          hover: "#2A524C",
          dark: "#1E3B37",
          light: "#4A7C75",
          surface: "#F0F5F4",
          border: "#C8DCD9",
        },
        weather: {
          rain: "#4277AA", // Rain and forecast data
          rainSurface: "#EFF5FB",
          rainBorder: "#CBE0F3",
          sun: "#D9A441", // Sunshine and warmth
          sunSurface: "#FCF7EB",
          sunBorder: "#F4DFB4",
          alert: "#B9493D", // Severe-weather alerts
          alertSurface: "#FAEEEC",
          alertBorder: "#E8B8B3",
        },
        // Backwards compatibility mappings for existing component styles
        navy: {
          950: "#F5F3EE",
          900: "#FFFFFF",
          850: "#FAFAF8",
          800: "#F0EFEA",
          700: "#DEE2DD",
          600: "#C7CECE",
          500: "#68747A",
        },
        sky: {
          300: "#CBE0F3",
          350: "#4277AA",
          400: "#3B6E9E",
          450: "#35665F",
          500: "#2A524C",
        },
        amber: {
          350: "#F4DFB4",
          450: "#D9A441",
          500: "#B8832A",
        },
        emerald: {
          450: "#35665F",
          500: "#35665F",
        },
      },
      fontFamily: {
        sans: [
          '"Instrument Sans"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        editorial: [
          '"Newsreader"',
          "Georgia",
          "Cambria",
          "serif",
        ],
      },
      boxShadow: {
        card: "0 1px 3px rgba(24, 37, 43, 0.04), 0 1px 2px rgba(24, 37, 43, 0.02)",
        lift: "0 4px 12px -2px rgba(24, 37, 43, 0.08), 0 2px 6px -1px rgba(24, 37, 43, 0.04)",
      },
    },
  },
  plugins: [],
};

