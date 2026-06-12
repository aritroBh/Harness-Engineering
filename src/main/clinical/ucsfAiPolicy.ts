import type { AiRoute, ClinicalContextBundle } from "./types";

export const COMMERCIAL_AI_ENDPOINTS = [
  "api.anthropic.com",
  "api.openai.com",
  "generativelanguage.googleapis.com",
  "api.x.ai",
  "api.cohere.com",
  "api.mistral.ai",
  "api.together.xyz",
] as const;

export const UCSF_VERSA_ENDPOINTS = [
  "versa.ucsf.edu",
  "api.versa.ucsf.edu",
  "versa-api.ucsf.edu",
] as const;

export interface UcsfAiPolicyConfig {
  route: AiRoute;
  versaBaseUrl?: string;
  versaApiKey?: string;
  healthAiOversightApproved: boolean;
  allowAnthropicDirectForSyntheticOnly: boolean;
}

export class UcsfAiPolicyError extends Error {
  public readonly bundleHash?: string;
  public readonly attemptedRoute: AiRoute;
  constructor(message: string, attemptedRoute: AiRoute, bundleHash?: string) {
    super(`[UCSF_AI_POLICY] ${message}`);
    this.name = "UcsfAiPolicyError";
    this.attemptedRoute = attemptedRoute;
    this.bundleHash = bundleHash;
    Object.setPrototypeOf(this, UcsfAiPolicyError.prototype);
  }
}

export function loadUcsfAiPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): UcsfAiPolicyConfig {
  const requested = (env.UCSF_AI_ROUTE || "").toLowerCase();
  const route: AiRoute =
    requested === "ucsf_versa" || requested === "versa"
      ? "ucsf_versa"
      : requested === "anthropic_direct" || requested === "anthropic"
        ? "anthropic_direct"
        : requested === "blocked"
          ? "blocked"
          : "mock";
  return {
    route,
    versaBaseUrl: env.UCSF_VERSA_BASE_URL,
    versaApiKey: env.UCSF_VERSA_API_KEY,
    healthAiOversightApproved: env.UCSF_HEALTH_AI_OVERSIGHT_APPROVED === "true",
    allowAnthropicDirectForSyntheticOnly:
      env.UCSF_ALLOW_ANTHROPIC_DIRECT_FOR_SYNTHETIC === "true",
  };
}

export interface PreflightInput {
  bundle: ClinicalContextBundle;
  config: UcsfAiPolicyConfig;
}

export interface PreflightResult {
  permitted: boolean;
  effectiveRoute: AiRoute;
  reason: string;
  warnings: string[];
}

export function preflightCheck(input: PreflightInput): PreflightResult {
  const { bundle, config } = input;
  const warnings: string[] = [];
  const phi = bundle.containsPhi === true;

  if (phi && !config.healthAiOversightApproved) {
    warnings.push(
      "Bundle contains PHI but UCSF_HEALTH_AI_OVERSIGHT_APPROVED is not set; production deployment requires Health AI Oversight Committee review.",
    );
  }

  if (config.route === "blocked") {
    return {
      permitted: false,
      effectiveRoute: "blocked",
      reason: "AI route explicitly blocked by configuration.",
      warnings,
    };
  }

  if (phi && config.route === "anthropic_direct") {
    return {
      permitted: false,
      effectiveRoute: "blocked",
      reason:
        "UCSF policy 650-16 prohibits sharing P3/P4 data with commercial AI endpoints. PHI bundle cannot be routed to api.anthropic.com. Use UCSF Versa (ucsf_versa).",
      warnings,
    };
  }

  if (config.route === "ucsf_versa") {
    if (!config.versaBaseUrl || !config.versaApiKey) {
      return {
        permitted: false,
        effectiveRoute: "blocked",
        reason:
          "UCSF Versa route requested but UCSF_VERSA_BASE_URL or UCSF_VERSA_API_KEY is not set.",
        warnings,
      };
    }
    return {
      permitted: true,
      effectiveRoute: "ucsf_versa",
      reason: "Route to UCSF Versa (HIPAA-compliant gateway).",
      warnings,
    };
  }

  if (config.route === "anthropic_direct") {
    if (phi) {
      return {
        permitted: false,
        effectiveRoute: "blocked",
        reason: "Refusing PHI ingestion on commercial endpoint.",
        warnings,
      };
    }
    if (!config.allowAnthropicDirectForSyntheticOnly) {
      return {
        permitted: false,
        effectiveRoute: "blocked",
        reason:
          "anthropic_direct requires explicit UCSF_ALLOW_ANTHROPIC_DIRECT_FOR_SYNTHETIC=true and a non-PHI bundle.",
        warnings,
      };
    }
    if (
      bundle.institution &&
      bundle.institution !== "synthetic" &&
      bundle.institution !== "non_ucsf"
    ) {
      warnings.push(
        `Institution=${bundle.institution} on commercial route; verify content is genuinely non-PHI.`,
      );
    }
    return {
      permitted: true,
      effectiveRoute: "anthropic_direct",
      reason: "Synthetic/non-PHI content on commercial endpoint (allowlisted).",
      warnings,
    };
  }

  return {
    permitted: true,
    effectiveRoute: "mock",
    reason: "Mock/fixture-grounded fallback (no network call).",
    warnings,
  };
}

export interface AuditEntry {
  ts: string;
  route: AiRoute;
  bundleSourceCount: number;
  containsPhi: boolean;
  institution?: ClinicalContextBundle["institution"];
  permitted: boolean;
  reason: string;
}

export function buildAuditEntry(
  bundle: ClinicalContextBundle,
  preflight: PreflightResult,
): AuditEntry {
  return {
    ts: new Date().toISOString(),
    route: preflight.effectiveRoute,
    bundleSourceCount: bundle.sources.length,
    containsPhi: bundle.containsPhi === true,
    institution: bundle.institution,
    permitted: preflight.permitted,
    reason: preflight.reason,
  };
}

export function describeRoute(route: AiRoute): string {
  switch (route) {
    case "ucsf_versa":
      return "UCSF Versa (HIPAA-compliant; approved for P3/P4 / PHI)";
    case "anthropic_direct":
      return "Anthropic API (commercial; synthetic/non-PHI ONLY)";
    case "mock":
      return "Mock/fixture-grounded (offline)";
    case "blocked":
      return "Blocked (no LLM call permitted)";
  }
}
