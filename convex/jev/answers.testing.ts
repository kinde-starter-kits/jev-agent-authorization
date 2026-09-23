export type AnswerInput = {
  matches?: number;
  destructive?: number;
  injected?: number;
  exfiltration?: number;
  risk?: number;
  riskConfidence?: number;
  hint?: 'allow' | 'step_up' | 'deny';
};

export function jevAnswers(input: AnswerInput = {}) {
  const hint = input.hint ?? 'allow';
  return {
    matches_intent: {type: 'noul', noul: input.matches ?? 0.95},
    destructive: {type: 'noul', noul: input.destructive ?? 0.02},
    injected: {type: 'noul', noul: input.injected ?? 0.03},
    exfiltration: {type: 'noul', noul: input.exfiltration ?? 0.02},
    risk: {
      type: 'score',
      score: input.risk ?? 0.1,
      confidence: input.riskConfidence ?? 0.95,
      legend: {},
      probabilities: {}
    },
    verdict_hint: {
      type: 'choice',
      choice: hint,
      confidence: 0.9,
      probabilities: {
        allow: hint === 'allow' ? 0.9 : 0.05,
        step_up: hint === 'step_up' ? 0.9 : 0.05,
        deny: hint === 'deny' ? 0.9 : 0.05
      }
    }
  };
}
