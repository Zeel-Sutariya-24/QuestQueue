import type { NextConfig } from "next";

const gamePort = process.env.GAME_SERVER_PORT || "4001";

const nextConfig: NextConfig = {
  // Socket.IO clients request "/socket.io/" with a trailing slash.
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["socket.io", "ioredis", "pg"],
  async rewrites() {
    return [
      {
        // The Socket.IO game server runs in the same process on its own port.
        source: "/socket.io/:path*",
        destination: `http://127.0.0.1:${gamePort}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
