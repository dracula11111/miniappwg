module.exports = {
    apps: [
      {
        name: "server",
        script: "server.js",
        env: { NODE_ENV: "production" },
      },
      {
        name: "relayer",
        script: "relayer.js",
        args: "run",
        env: { NODE_ENV: "production" },
      },
    ],
  };
  