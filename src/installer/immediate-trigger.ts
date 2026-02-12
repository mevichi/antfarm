import { getDb } from "../db.js";

/**
 * Wake the next pending agent for a workflow run.
 * Call this after a step completes to trigger the next agent immediately.
 */
export function wakeNextAgent(runId: string): void {
  const db = getDb();
  
  // Find the next pending step
  const nextStep = db.prepare(
    "SELECT s.id, s.agent_id, s.step_id FROM steps s JOIN runs r ON r.id = s.run_id WHERE s.run_id = ? AND s.status = 'pending' AND r.status NOT IN ('failed', 'cancelled') ORDER BY s.step_index ASC LIMIT 1"
  ).get(runId) as { id: string; agent_id: string; step_id: string } | undefined;

  if (!nextStep) {
    console.log(`[wakeNextAgent] No pending step found for run ${runId}`);
    return;
  }

  console.log(`[wakeNextAgent] Would wake agent ${nextStep.agent_id} for step ${nextStep.step_id} in run ${runId}`);
}
