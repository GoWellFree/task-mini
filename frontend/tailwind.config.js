/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        // Legacy Telegram passthrough — only for the rare spot that must match
        // Telegram's own chrome exactly. New UI should use the tokens below.
        tg: {
          bg: "var(--tg-bg-color)",
          text: "var(--tg-text-color)",
          hint: "var(--tg-hint-color)",
          link: "var(--tg-link-color)",
          button: "var(--tg-button-color)",
          buttonText: "var(--tg-button-text-color)",
          secondaryBg: "var(--tg-secondary-bg-color)",
        },
        surface: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          elevated: "var(--bg-elevated)",
          overlay: "var(--bg-overlay)",
        },
        content: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          inverse: "var(--text-inverse)",
        },
        border: {
          subtle: "var(--border-subtle)",
        },
        accent: {
          DEFAULT: "var(--accent-primary)",
          hover: "var(--accent-primary-hover)",
          soft: "var(--accent-primary-soft)",
          secondary: "var(--accent-secondary)",
        },
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
        priority: {
          low: "var(--priority-low)",
          medium: "var(--priority-medium)",
          high: "var(--priority-high)",
          critical: "var(--priority-critical)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        float: "var(--shadow-float)",
        sheet: "var(--shadow-sheet)",
      },
      maxWidth: {
        content: "1360px",
      },
    },
  },
  plugins: [],
};
