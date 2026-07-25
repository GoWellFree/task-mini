/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: "var(--tg-bg-color)",
          text: "var(--tg-text-color)",
          hint: "var(--tg-hint-color)",
          link: "var(--tg-link-color)",
          button: "var(--tg-button-color)",
          buttonText: "var(--tg-button-text-color)",
          secondaryBg: "var(--tg-secondary-bg-color)",
        },
      },
    },
  },
  plugins: [],
};
