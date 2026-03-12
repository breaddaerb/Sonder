const esbuild = require("esbuild");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const TEST_FILES = [
  "context-chat-model.test.ts",
  "custom-api-provider.test.ts",
];

async function runTestFile(testFile) {
  const outfile = path.join(os.tmpdir(), `sonder-${testFile.replace(/\.ts$/, "")}-${Date.now()}.cjs`);
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, "..", "tests", testFile)],
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

async function main() {
  for (const testFile of TEST_FILES) {
    await runTestFile(testFile);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
