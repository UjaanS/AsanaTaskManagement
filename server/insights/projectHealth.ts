export type ProjectHealthStatus = "green" | "yellow" | "red";

export function computeProjectHealth(input: {
  completionPct: number;
  overdueCount: number;
  blockerCount: number;
  totalCount: number;
}): { riskScore: number; status: ProjectHealthStatus } {
  const overdueRatio = input.totalCount > 0 ? input.overdueCount / input.totalCount : 0;
  const blockerRatio = input.totalCount > 0 ? input.blockerCount / input.totalCount : 0;
  const riskScore = (1 - input.completionPct / 100) * 35 + overdueRatio * 35 + blockerRatio * 30;
  const status = riskScore >= 60 ? "red" : riskScore >= 35 ? "yellow" : "green";
  return { riskScore: Number(riskScore.toFixed(2)), status };
}
