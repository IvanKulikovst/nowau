/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    screens: { md: "768px", lg: "1440px" },
    extend: {
      colors: {
        primary: "var(--color-primary)", "primary-hover": "var(--color-primary-hover)",
        bg: "var(--color-bg)", surface: "var(--color-surface)", surface2: "var(--color-surface-2)",
        border: "var(--color-border)", fg: "var(--color-text)", muted: "var(--color-text-muted)",
        success: "var(--color-success)", warning: "var(--color-warning)", danger: "var(--color-danger)", info: "var(--color-info)",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      borderRadius: { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)" },
      boxShadow: { sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)" },
    },
  },
  plugins: [],
};
