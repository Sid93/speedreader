import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "in.sidsaboo.speedreader",
  appName: "Speed Reader",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
  },
};

export default config;
