import { getDb } from "../db.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

interface GatewayConfig {
  url: string;
  token?: string;
}

async function getGatewayConfig(): Promise<GatewayConfig> {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    const port = config.gateway?.port ?? 18789;
    return {
      url: `http://127.0.0.1:${port}`,
      token: config.gateway?.auth?.token,
    };
  } catch {
    return { url: "http://127.0.0.1:18789" };
  }
}

/**
 * Actually wake an agent via the gateway cron wake API.
 */
async function wakeAgent(agentId: string): Promise<boolean> {
  try {
    const gateway = await getGatewayConfig();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.token) headers["Authorization"] = `Bearer ${gateway.token}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tool: "cron",
        args: { action: "wake", mode: "now" },
        sessionKey: `agent:${agentId}:${agentId}`,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

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

  // Actually wake the agent
  wakeAgent(nextStep.agent_id).then(success => {
    if (success) {
      console.log(`[wakeNextAgent] ✅ Woke agent ${nextStep.agent_id} for step ${nextStep.step_id} in run ${runId}`);
    } else {
      console.log(`[wakeNextAgent] ⚠️ Failed to wake agent ${nextStep.agent_id} for step ${nextStep.step_id} in run ${runId}`);
    }
  }).catch(err => {
    console.log(`[wakeNextAgent] ❌ Error waking agent ${nextStep.agent_id}: ${err}`);
  });
}
