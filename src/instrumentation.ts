export async function register() {
  // Vercel runs the web app as functions; run the game socket server as a
  // separate persistent Node service and point the client at it instead.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL && !process.env.NEXT_PUBLIC_SOCKET_URL) {
    const { startGameServer } = await import("./server/bootstrap");
    await startGameServer();
  }
}
