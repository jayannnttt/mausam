/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#070d1c",
          900: "#0b1428",
          850: "#0f1b33",
          800: "#14243f",
          700: "#1d3254",
          600: "#27436e",
        },
        sky: {
          350: "#7dd3fc",
          450: "#38bdf8",
        },
        amber: {
          450: "#f6b83d",
        },
      },
      fontFamily: {
        sans: [
          '"Source Sans 3"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(2, 8, 23, 0.5), 0 8px 24px -12px rgba(2, 8, 23, 0.6)",
      },
    },
  },
  plugins: [],
};
