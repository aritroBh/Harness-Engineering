import { BanditState } from "../session/types";
import { safeLog } from "../logger";

export const ARM_A = "show_once";
export const ARM_B = "show_twice";
export const ARM_C = "micro_steps";

export const ARM_STYLE: Record<string, string> = {
  A: ARM_A,
  B: ARM_B,
  C: ARM_C,
};

export const ARMS: (keyof BanditState)[] = ["A", "B", "C"];

function sampleNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleGamma(shape: number): number {
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    const x = sampleNormal();
    const value = 1 + c * x;
    if (value <= 0) continue;
    const v = value * value * value;
    const u = Math.random();
    if (
      u < 1 - 0.0331 * x ** 4 ||
      Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))
    ) {
      return d * v;
    }
  }
}

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  const total = x + y;
  return total > 0 ? x / total : 0;
}

function positiveNumber(value: any, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function normalizeBanditTuple(
  value: any,
  fallback: [number, number],
): [number, number] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return [
    positiveNumber(value[0], fallback[0]),
    positiveNumber(value[1], fallback[1]),
  ];
}

export function createDefaultBanditState(): BanditState {
  return {
    A: [1, 1],
    B: [1, 1],
    C: [1, 1],
  };
}

export function normalizeBanditState(banditState: any): BanditState {
  const defaults = createDefaultBanditState();
  return {
    A: normalizeBanditTuple(banditState?.A, defaults.A),
    B: normalizeBanditTuple(banditState?.B, defaults.B),
    C: normalizeBanditTuple(banditState?.C, defaults.C),
  };
}

export function selectArm(banditState: BanditState): keyof BanditState {
  const normalized = normalizeBanditState(banditState);
  const samples = ARMS.map((arm) => {
    const [alpha, beta] = normalized[arm];
    return { arm, sample: sampleBeta(alpha, beta) };
  });

  samples.sort((left, right) => right.sample - left.sample);
  return samples[0].arm;
}

export function recordReward(
  banditState: BanditState,
  arm: keyof BanditState,
  reward: number,
): BanditState {
  const normalized = normalizeBanditState(banditState);
  const [alpha, beta] = normalized[arm];

  const updated = {
    ...normalized,
    [arm]: [alpha + reward, beta + (1 - reward)],
  };

  const winningStyle = getCurrentStyle(updated);
  safeLog("[Specter] Teaching style currently winning:", winningStyle);
  return updated as BanditState;
}

export function getCurrentStyle(banditState: BanditState): string {
  const normalized = normalizeBanditState(banditState);
  const ranked = ARMS.map((arm) => {
    const [alpha, beta] = normalized[arm];
    return { arm, mean: alpha / (alpha + beta) };
  }).sort((left, right) => right.mean - left.mean);

  return ARM_STYLE[ranked[0].arm];
}
