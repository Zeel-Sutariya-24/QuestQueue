export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGameServer } = await import("./server/bootstrap");
    await startGameServer();
  }
}
