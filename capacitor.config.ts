import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.haloguard.mobile",
  appName: "Halo Guard",
  webDir: "dist",
  android: {
    // Keeps the dark theme from flashing white while the WebView boots.
    backgroundColor: "#0A0E14",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      backgroundColor: "#0A0E14",
      androidSplashResourceName: "launch_screen",
      supportsRTL: true,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_halo",
      iconColor: "#2DD4BF",
    },
  },
};

export default config;
