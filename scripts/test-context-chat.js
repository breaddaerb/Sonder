const esbuild = require("esbuild");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

async function main() {
  const outfile = path.join(os.tmpdir(), `sonder-context-chat-test-${Date.now()}.cjs`);
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, "..", "tests", "context-chat-model.test.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      outfile,
      logLevel: "silent",
    });

    const result = spawnSync(process.execPath, [outfile], { stdio: "inherit" });
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  } finally {
    fs.rmSync(outfile, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
