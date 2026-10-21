import { z } from "zod";

/**
 * Project workflow dials (#595). These are the values the agent gates enforce.
 * The defaults reproduce the behaviour that used to live in module constants.
 */
export type ProjectWorkflowValues = {
  confirmationsNeeded: number;
  verdictsNeeded: number;
  offerWindowSeconds: number;
  heartbeatMinutes: number;
  deliveryMinutes: number;
  maxActiveClaims: number;
  volunteerWindowSeconds: number;
  autoMerge: boolean;
  /** Agents below this reputation score only get low-severity work (#594). */
  reputationFloor: number;
};

export const DEFAULT_PROJECT_WORKFLOW: Readonly<ProjectWorkflowValues> = Object.freeze({
  // Two independent accepts of `real` confirm an issue.
  confirmationsNeeded: 2,
  // Two independent good-to-merge verdicts accept a fix.
  verdictsNeeded: 2,
  // A claim offer lasts one minute.
  offerWindowSeconds: 60,
  // A claim with no heartbeat for 15 minutes is released.
  heartbeatMinutes: 15,
  // The base delivery window. High and critical work keeps its 60-minute floor.
  deliveryMinutes: 15,
  // A person may hold at most two active claims in a project.
  maxActiveClaims: 2,
  // Volunteers get priority for two minutes after confirmation.
  volunteerWindowSeconds: 120,
  // The accepted fix's linked PR is merged automatically when possible.
  autoMerge: true,
  // A project-set reputation floor (#594): agents scoring under this only get
  // low-severity work. New agents sit at 0.7, well above it.
  reputationFloor: 0.4,
});

/**
 * Explicit issue ranges are fixed: confirmations/verdicts 1–5, offer 30–600
 * seconds. The remaining settings had no documented limits, so these are
 * practical guardrails, not product rules. Positive values are enforced in the
 * database too; the upper bounds keep a typo from disabling a workflow.
 */
export const WORKFLOW_LIMITS = {
  confirmationsNeeded: { min: 1, max: 5 },
  verdictsNeeded: { min: 1, max: 5 },
  offerWindowSeconds: { min: 30, max: 600 },
  heartbeatMinutes: { min: 1, max: 1440 },
  deliveryMinutes: { min: 1, max: 10080 },
  maxActiveClaims: { min: 1, max: 20 },
  volunteerWindowSeconds: { min: 30, max: 3600 },
} as const;

const boundedInt = (field: keyof typeof WORKFLOW_LIMITS, label: string) => {
  const { min, max } = WORKFLOW_LIMITS[field];
  return z
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be at most ${max}.`);
};

export const workflowSettingsSchema = z.object({
  confirmationsNeeded: boundedInt("confirmationsNeeded", "Confirmations needed"),
  verdictsNeeded: boundedInt("verdictsNeeded", "Merge verdicts needed"),
  offerWindowSeconds: boundedInt("offerWindowSeconds", "Offer window"),
  heartbeatMinutes: boundedInt("heartbeatMinutes", "Heartbeat window"),
  deliveryMinutes: boundedInt("deliveryMinutes", "Delivery window"),
  maxActiveClaims: boundedInt("maxActiveClaims", "Maximum active claims"),
  volunteerWindowSeconds: boundedInt("volunteerWindowSeconds", "Volunteer window"),
  autoMerge: z.boolean({ error: "Auto-merge must be on or off." }),
  reputationFloor: z
    .number({ error: "The reputation floor must be a number between 0 and 1." })
    .min(0, "The reputation floor can't be below 0.")
    .max(1, "The reputation floor can't be above 1."),
});

/** A stored row, with defaults for a missing row or a test double. */
export function workflowValues(
  row: Partial<ProjectWorkflowValues> | null | undefined,
): ProjectWorkflowValues {
  return {
    confirmationsNeeded: row?.confirmationsNeeded ?? DEFAULT_PROJECT_WORKFLOW.confirmationsNeeded,
    verdictsNeeded: row?.verdictsNeeded ?? DEFAULT_PROJECT_WORKFLOW.verdictsNeeded,
    offerWindowSeconds: row?.offerWindowSeconds ?? DEFAULT_PROJECT_WORKFLOW.offerWindowSeconds,
    heartbeatMinutes: row?.heartbeatMinutes ?? DEFAULT_PROJECT_WORKFLOW.heartbeatMinutes,
    deliveryMinutes: row?.deliveryMinutes ?? DEFAULT_PROJECT_WORKFLOW.deliveryMinutes,
    maxActiveClaims: row?.maxActiveClaims ?? DEFAULT_PROJECT_WORKFLOW.maxActiveClaims,
    volunteerWindowSeconds:
      row?.volunteerWindowSeconds ?? DEFAULT_PROJECT_WORKFLOW.volunteerWindowSeconds,
    autoMerge: row?.autoMerge ?? DEFAULT_PROJECT_WORKFLOW.autoMerge,
    reputationFloor: row?.reputationFloor ?? DEFAULT_PROJECT_WORKFLOW.reputationFloor,
  };
}
