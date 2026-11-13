import { checklistCounts } from './inspection.js';

/*
 * The final result, after the security checklist. It starts from the photo
 * result and updates it with the user's answers, treating each answer as a
 * piece of evidence:
 *
 *   matching feature        genuine becomes 1.3 times more likely
 *   feature doesn't match   genuine becomes 10 times less likely
 *   couldn't check          no change
 *
 * "Not a counterfeit" still needs the same certainty as the photo result
 * (95% by default). A single feature that doesn't match rules it out and caps
 * the certainty at 50%. Users only see the label; the number stays internal.
 *
 * With 10 matching features the odds go up about 14 times, so a photo result
 * of 60% becomes 95%. A photo result of 50% stays below 95% even if every
 * feature matches, because a good counterfeit can pass a check by eye.
 */
const MATCH_RATIO = 1.3;
const MISMATCH_RATIO = 0.1;

// Never claim 100%.
const MAX_CERTAINTY = 0.99;

// The most the app will say when any feature doesn't match.
const MISMATCH_CAP = 0.5;

export function finalJudgement(item) {
  const ai = item.ai;
  const counts = checklistCounts(item);

  const photoP = Math.min(Math.max(ai.pGenuine, 0.001), 0.999);
  const photoOdds = photoP / (1 - photoP);
  const odds = photoOdds * MATCH_RATIO ** counts.ok * MISMATCH_RATIO ** counts.no;
  const cap = counts.no > 0 ? MISMATCH_CAP : MAX_CERTAINTY;
  const pGenuine = Math.min(cap, odds / (1 + odds));
  const percent = Math.round(pGenuine * 100);

  const cleared = counts.no === 0 && percent >= ai.threshold;

  return {
    pGenuine,
    confidence: percent / 100,
    label: cleared ? 'genuine' : 'counterfeit',
    threshold: ai.threshold,
    counts,
  };
}
