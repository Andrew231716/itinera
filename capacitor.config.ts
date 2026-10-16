import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the hosted Next.js app (Vercel) in a native WebView.
 * Set CAPACITOR_SERVER_URL to your production / preview URL before `npx cap sync`.
 *
 * Background GPS: enable location permissions in the native projects
 * (see MOBILE_APP.md). The JS bridge in src/lib/navigation/platform.ts
 * uses @capacitor/geolocation when running inside the shell.
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://example.com";

const config: CapacitorConfig = {
  appId: "app.itinera.planner",
  appName: "Itinera",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
  plugins: {
    Geolocation: {
      // Request precise location; background modes are configured in Info.plist / AndroidManifest
    },
  },
};

export default config;
