import { getGameServer, startGameServer } from "./bootstrap";

startGameServer()
  .then(() => {
    if (!getGameServer()) {
      console.error("[game] standalone server did not start");
      process.exitCode = 1;
    }
  })
  .catch((error: unknown) => {
    console.error("[game] standalone server failed to start", error);
    process.exitCode = 1;
  });
