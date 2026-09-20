import { z } from "zod";
import type { Project } from "@/db/schema";
import type { ChatMessage, CompletionUsage } from "@/lib/llm/client";
import { completeValidatedJson } from "@/lib/llm/validate";
import { LINK_CONFIDENCE_THRESHOLD } from "./config";

export const routingResponseSchema = z.object({
  project_id: z.string().nullable().default(null),
  link_type: z.enum(["feature", "spinoff", "standalone"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(2000).default(""),
});

export type RoutingDecision =
  | {
      status: "linked";
      projectId: string;
      linkType: "feature" | "spinoff";
      confidence: number;
      reasoning: string;
    }
  | {
      status: "standalone";
      projectId: null;
      linkType: "standalone";
      confidence: number;
      reasoning: string;
    }
  | {
      status: "unsorted";
      projectId: null;
      linkType: null;
      confidence: number;
      reasoning: string;
    };

export type RouteIdeaResult = {
  decision: RoutingDecision;
  raw: string;
  usage: CompletionUsage;
  error?: string;
};

const SYSTEM_PROMPT = `You route captured ideas for a single user. You output only json.

Given one raw idea and the user's current projects, decide whether the idea
belongs to an existing project and how.

Definitions:
- "feature": a feature, improvement, or fix inside an existing project's current scope.
- "spinoff": related to an existing project but really its own separate product or effort.
- "standalone": not tied to any existing project.

Rules:
- project_id must be an id copied exactly from the project list, or null for standalone.
- confidence is 0..1: how sure you are of this routing decision.
- If the idea plausibly relates to a project but you are not sure, set project_id and a low confidence. Never guess a high confidence.
- reasoning is one or two short sentences.`;

function projectBlock(
  projects: Pick<Project, "id" | "name" | "oneLiner">[],
): string {
  if (projects.length === 0) {
    return "The user has no projects yet.";
  }
  return projects
    .map(
      (project) =>
        `- id: ${project.id}\n  name: ${project.name}\n  one-liner: ${
          project.oneLiner ?? "(none)"
        }`,
    )
    .join("\n");
}

export async function routeIdea(
  ideaText: string,
  projects: Pick<Project, "id" | "name" | "oneLiner">[],
): Promise<RouteIdeaResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Projects:\n${projectBlock(projects)}\n\nIdea:\n"""${ideaText}"""\n\nReturn json with keys: project_id, link_type, confidence, reasoning.`,
    },
  ];

  const result = await completeValidatedJson({
    schema: routingResponseSchema,
    messages,
    options: { kind: "routing", thinking: false, maxTokens: 600, temperature: 0 },
  });

  if (!result.ok) {
    return {
      decision: unsorted(0, ""),
      raw: result.raw,
      usage: result.usage,
      error: result.error,
    };
  }

  const parsed = result.data;
  const matched = parsed.project_id
    ? (projects.find((project) => project.id === parsed.project_id) ?? null)
    : null;

  if (
    matched &&
    parsed.link_type !== "standalone" &&
    parsed.confidence >= LINK_CONFIDENCE_THRESHOLD
  ) {
    return {
      decision: {
        status: "linked",
        projectId: matched.id,
        linkType: parsed.link_type,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      },
      raw: result.raw,
      usage: result.usage,
    };
  }

  if (
    !matched &&
    parsed.link_type === "standalone" &&
    parsed.confidence >= LINK_CONFIDENCE_THRESHOLD
  ) {
    return {
      decision: {
        status: "standalone",
        projectId: null,
        linkType: "standalone",
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      },
      raw: result.raw,
      usage: result.usage,
    };
  }

  // Below threshold, unknown project id, or contradictory output.
  return {
    decision: unsorted(parsed.confidence, parsed.reasoning),
    raw: result.raw,
    usage: result.usage,
  };
}

function unsorted(confidence: number, reasoning: string): RoutingDecision {
  return {
    status: "unsorted",
    projectId: null,
    linkType: null,
    confidence,
    reasoning,
  };
}
