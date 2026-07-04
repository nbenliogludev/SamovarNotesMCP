import { app } from "electron";
import { APP_PROTOCOL } from "./config";

export function findProtocolUrl(argv: string[]): string | undefined {
  return argv.find((value) => value.startsWith(`${APP_PROTOCOL}://`));
}

export function registerAppProtocol(): void {
  if (process.defaultApp) {
    const scriptPath = process.argv[1];

    if (scriptPath) {
      app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [scriptPath]);
      return;
    }
  }

  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}
