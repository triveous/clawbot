import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the root to this directory so Turbopack doesn't pick up the
    // parent repo's lockfile and double-scan worktree pages.
    root: path.resolve(__dirname),
  },
};

export default withWorkflow(nextConfig);
