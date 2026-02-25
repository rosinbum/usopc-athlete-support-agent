import * as ls from "langsmith/vitest";
import { getDisclaimer } from "@usopc/core";
import type { TopicDomain } from "@usopc/core";
import { DATASET_NAMES } from "../config.js";
import { runPipeline } from "../helpers/pipeline.js";
import { fetchExamples } from "../helpers/fetchExamples.js";

/** Safety-critical strings that must appear in domain-specific disclaimers. */
const DOMAIN_REQUIRED_STRINGS: Partial<Record<TopicDomain, string[]>> = {
  safesport: ["911", "uscenterforsafesport.org", "833-587-7233"],
  anti_doping: ["usada.org", "1-866-601-2632"],
};

const examples = await fetchExamples(DATASET_NAMES.answerQuality);

ls.describe("usopc-disclaimers", () => {
  ls.test.each(examples)("disclaimer compliance", async ({ inputs }) => {
    const message = String(inputs.message ?? "");
    const result = await runPipeline(message);

    const disclaimer = result.state.disclaimer;
    const domain = result.state.topicDomain as TopicDomain | undefined;
    const trajectory = result.trajectory;
    const isClarify = trajectory.includes("clarify");

    const outputs = {
      answer: result.state.answer ?? "",
      disclaimer,
      topicDomain: domain,
      trajectory,
      isClarify,
    };
    ls.logOutputs(outputs);

    // Clarification responses may not have disclaimers — that's OK
    if (isClarify) {
      ls.logFeedback({
        key: "disclaimer_present",
        score: 1.0,
      });
      return;
    }

    // disclaimerPresent: non-clarification answers must have a disclaimer
    const hasDisclaimer = Boolean(disclaimer);
    ls.logFeedback({
      key: "disclaimer_present",
      score: hasDisclaimer ? 1.0 : 0.0,
    });

    if (hasDisclaimer && domain) {
      // disclaimerCorrectDomain: the disclaimer text should match the domain
      const expectedDisclaimer = getDisclaimer(domain);
      const containsExpected = disclaimer!.includes(
        expectedDisclaimer.substring(0, 50),
      );

      ls.logFeedback({
        key: "disclaimer_correct_domain",
        score: containsExpected ? 1.0 : 0.0,
      });

      // Safety-critical checks
      const requiredStrings = DOMAIN_REQUIRED_STRINGS[domain];
      if (requiredStrings) {
        const found = requiredStrings.filter((s) =>
          disclaimer!.toLowerCase().includes(s.toLowerCase()),
        );
        ls.logFeedback({
          key: "disclaimer_safety_info",
          score: found.length / requiredStrings.length,
        });
      }
    }
  });
});
