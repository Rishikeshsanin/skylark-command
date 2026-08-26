import { runCopilotEvaluation } from "../src/lib/agent/v2/evaluation-runner";

async function main() {
  const report = await runCopilotEvaluation();
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Copilot evaluation failed.");
  process.exitCode = 1;
});
