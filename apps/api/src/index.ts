import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { attachSocketServer } from "./realtime/socket-server.js";

// A real http.Server, not app.listen()'s implicit one — Socket.IO needs
// to attach to it directly (see realtime/socket-server.ts).
const httpServer = createServer(app);
attachSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(`flowdesk-api listening on http://localhost:${env.PORT}`);
});
