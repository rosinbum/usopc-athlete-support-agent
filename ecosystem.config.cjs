// PM2 process manager configuration for EC2 deployment.
// Memory limits tuned for t3.small (2 GB total).
// Start with: sst shell -- pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "web",
      script: "apps/web/.next/standalone/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      max_memory_restart: "800M",
    },
    {
      name: "slack",
      script: "apps/slack/dist/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      instances: 1,
      max_memory_restart: "400M",
    },
  ],
};
