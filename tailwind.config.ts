import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          raised: "hsl(var(--surface-raised))",
          overlay: "hsl(var(--surface-overlay))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "broll-dissolve": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "broll-zoom": {
          "0%": { opacity: "0", transform: "scale(1.25)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "broll-slide": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "broll-glitch": {
          "0%": { opacity: "0", transform: "translate(5px, -3px) skewX(10deg)" },
          "25%": { opacity: "0.7", transform: "translate(-3px, 2px) skewX(-5deg)" },
          "50%": { opacity: "0.4", transform: "translate(2px, -1px) skewX(3deg)" },
          "75%": { opacity: "0.9", transform: "translate(-1px, 1px) skewX(-1deg)" },
          "100%": { opacity: "1", transform: "translate(0) skewX(0)" },
        },
        "broll-lightleak": {
          "0%": { opacity: "0", filter: "brightness(3) saturate(0)" },
          "40%": { opacity: "0.8", filter: "brightness(1.8) saturate(0.5)" },
          "100%": { opacity: "1", filter: "brightness(1) saturate(1)" },
        },
        "broll-fadeout": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "subtitle-pop": {
          "0%": { opacity: "0", transform: "scale(0.5)" },
          "60%": { opacity: "1", transform: "scale(1.1)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "subtitle-fade": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "subtitle-slide": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "subtitle-scale": {
          "0%": { opacity: "0", transform: "scale(0.3)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      "fade-in": {
        "0%": { opacity: "0" },
        "100%": { opacity: "1" },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out forwards",
        "broll-dissolve": "broll-dissolve 0.5s ease-out forwards",
        "broll-zoom": "broll-zoom 0.5s ease-out forwards",
        "broll-slide": "broll-slide 0.5s ease-out forwards",
        "broll-glitch": "broll-glitch 0.3s steps(4) forwards",
        "broll-lightleak": "broll-lightleak 0.6s ease-out forwards",
        "broll-fadeout": "broll-fadeout 0.5s ease-in forwards",
        "subtitle-pop": "subtitle-pop 0.25s ease-out forwards",
        "subtitle-fade": "subtitle-fade 0.3s ease-out forwards",
        "subtitle-slide": "subtitle-slide 0.3s ease-out forwards",
        "subtitle-scale": "subtitle-scale 0.3s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
