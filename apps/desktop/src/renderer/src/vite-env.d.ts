import type { SamovarDesktopApi } from "../../preload";

declare global {
  interface Window {
    samovar: SamovarDesktopApi;
  }
}

export {};
