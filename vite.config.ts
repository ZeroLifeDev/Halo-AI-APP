import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Google sign-in only works on Android once the Firebase Android config has
// been added, so the bundle records whether it was there at build time and the
// UI hides the button when it wasn't.
const googleConfigured = existsSync(resolve(__dirname, "android/app/google-services.json"));

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_GOOGLE_SIGNIN": JSON.stringify(String(googleConfigured)),
  },
  build: {
    // The WebView loads from the filesystem, so relative asset paths matter.
    assetsDir: "assets",
  },
});
