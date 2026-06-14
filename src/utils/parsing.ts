import { config } from "../../package.json";
import type { handlers } from "../extras/parsingWorker";
import { WorkerRpc } from "./workerRpc";

function closeParsingServer() {
  if (addon.data.parsing.server) {
    addon.data.parsing.server.terminate();
    addon.data.parsing.server = undefined;
  }
}

async function getParsingServer() {
  if (addon.data.parsing.server) {
    return addon.data.parsing.server;
  }
  const server = new WorkerRpc<typeof handlers>(
    `chrome://${config.addonRef}/content/scripts/parsingWorker.js`,
    { name: "parsingWorker" },
  );
  await server.ready();
  addon.data.parsing.server = server;
  return server;
}

export { getParsingServer, closeParsingServer };
