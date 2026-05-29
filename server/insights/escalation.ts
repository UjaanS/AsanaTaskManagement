interface EscalationInput {
  blockedDays: number;
  overdueDays: number;
  priority: string;
  staleDays: number;
}

export function shouldEscalate(input: EscalationInput) {
  const highPriority = /high|critical|urgent|p0|p1/i.test(input.priority);
  return input.blockedDays >= 3 || (highPriority && input.overdueDays > 0) || (highPriority && input.staleDays >= 5);
}
