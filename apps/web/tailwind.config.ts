import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f7f8fa",
        surface: "#ffffff",
        border: "#e5e7eb",
        foreground: "#111827",
        muted: "#6b7280",
        accent: "#2563eb",
        "accent-soft": "#eff6ff",
        success: "#166534",
        warning: "#92400e",
        danger: "#b91c1c"
      },
      borderRadius: {
        md: "8px",
        lg: "10px",
        xl: "12px"
      },
      boxShadow: {
        panel: "0 1px 2px rgba(16, 24, 40, 0.06)"
      }
    }
  },
  plugins: []
} satisfies Config;
