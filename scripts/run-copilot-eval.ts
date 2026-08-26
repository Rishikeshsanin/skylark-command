import { runCopilotEvaluation } from "../src/lib/agent/v2/evaluation-runner";

const report = await runCopilotEvaluation();
console.log(JSON.stringify(report, null, 2));
if (report.failures.length > 0) process.exitCode = 1;
