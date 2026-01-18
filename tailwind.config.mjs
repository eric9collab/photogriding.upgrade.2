/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      borderRadius: {
        panel: "1rem"
      },
      boxShadow: {
        panel: "0 18px 60px rgba(0, 0, 0, 0.35)"
      }
    }
  }
};
