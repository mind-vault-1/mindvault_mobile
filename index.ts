import { Buffer } from "buffer";
import { registerRootComponent } from "expo";

import App from "./App";

if (typeof global.Buffer === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).Buffer = Buffer;
}

registerRootComponent(App);
