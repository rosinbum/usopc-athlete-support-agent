import type { EmotionalState, TopicDomain } from "../types/index.js";

/**
 * Domain-aware emotional support templates providing situation-specific
 * acknowledgments, guidance, safety resources, and tone modifiers.
 *
 * These are pure template lookups — zero latency cost, no LLM call.
 */

// ---------------------------------------------------------------------------
// Acknowledgments: state × domain
// ---------------------------------------------------------------------------

type NonNeutralState = Exclude<EmotionalState, "neutral">;

const ACKNOWLEDGMENTS: Record<NonNeutralState, Record<string, string>> = {
  distressed: {
    safesport:
      "I hear you, and I want you to know that what you're experiencing is taken very seriously. " +
      "SafeSport issues can be deeply painful, and you deserve to feel safe. " +
      "You are not alone — confidential support is available right now.",
    anti_doping:
      "I understand this is a stressful situation. Anti-doping processes can feel overwhelming, " +
      "but you have rights and there are people who can help you navigate this. " +
      "Let me share what I know.",
    dispute_resolution:
      "I hear how difficult this is for you. Disputes can feel isolating, especially when " +
      "your athletic career is at stake. Your concerns are valid, and there are clear " +
      "processes designed to protect your interests.",
    team_selection:
      "I understand how upsetting team selection issues can be — your hard work and dedication " +
      "deserve fair consideration. Let me help you understand your options.",
    eligibility:
      "I hear you, and eligibility concerns can be incredibly stressful when your ability to " +
      "compete is on the line. Let me walk you through what I know.",
    governance:
      "I understand this is frustrating. Governance issues can feel like they're beyond your " +
      "control, but athletes have a voice in these processes. Let me help.",
    athlete_rights:
      "I hear you, and your rights as an athlete matter. It's understandable to feel distressed " +
      "when you believe those rights aren't being respected. Let me help you understand " +
      "your protections.",
    _default:
      "I hear you, and I want you to know that what you're feeling is valid. " +
      "You are not alone in this — support is available.",
  },
  panicked: {
    safesport:
      "I understand this feels overwhelming right now. If you or someone else is in immediate " +
      "danger, please call 911 first. Otherwise, let me walk you through the concrete steps " +
      "you can take right now to get help.",
    anti_doping:
      "I understand this feels urgent. Take a breath — there are specific steps and timelines " +
      "in the anti-doping process, and knowing them will help you feel more in control. " +
      "Let me walk you through this step by step.",
    dispute_resolution:
      "I know this feels urgent, but there are concrete steps you can take right now. " +
      "Dispute resolution processes have defined timelines, and knowing them will help " +
      "you feel more in control.",
    team_selection:
      "I understand the urgency you're feeling. Team selection decisions have specific review " +
      "processes and timelines. Let me walk you through exactly what you can do.",
    eligibility:
      "I know this feels time-sensitive. Eligibility decisions can be reviewed, and there are " +
      "clear steps you can take. Let me outline them for you.",
    governance:
      "I understand this feels overwhelming. Let me break this down into concrete, manageable " +
      "steps you can take right now.",
    athlete_rights:
      "I understand the urgency. Your rights are protected, and there are specific actions " +
      "you can take immediately. Let me walk you through them.",
    _default:
      "I understand this feels overwhelming right now. Take a breath — there are concrete " +
      "steps you can take, and I'll walk you through them.",
  },
  fearful: {
    safesport:
      "Your safety is the top priority. I want you to know that strong retaliation protections " +
      "exist for anyone who reports SafeSport concerns. You can report confidentially, and " +
      "it is illegal to retaliate against you for doing so.",
    anti_doping:
      "I understand your concerns. The anti-doping process has confidentiality protections " +
      "built in, and you have the right to representation throughout. Your privacy is protected.",
    dispute_resolution:
      "I want you to know that dispute resolution processes include confidentiality protections. " +
      "You have the right to pursue your case without fear of retaliation.",
    team_selection:
      "I understand your concern about speaking up. Anti-retaliation protections exist for " +
      "athletes who challenge team selection decisions. You have the right to seek review " +
      "without fear of consequences.",
    eligibility:
      "I understand your worry. Eligibility processes are confidential, and you have protections " +
      "against retaliation for raising concerns. Your right to compete is taken seriously.",
    governance:
      "I want you to know that athletes who raise governance concerns are protected from " +
      "retaliation. There are confidential channels available to you.",
    athlete_rights:
      "Your right to speak up is protected. Anti-retaliation provisions exist specifically " +
      "to ensure athletes can raise concerns safely. There are confidential ways to get help.",
    _default:
      "I want you to know that retaliation protections exist to keep you safe, and there are " +
      "confidential ways to get help. You have the right to speak up without fear.",
  },
};

/**
 * Returns a situation-specific acknowledgment based on emotional state and domain.
 */
export function getAcknowledgment(
  state: EmotionalState,
  domain?: TopicDomain,
): string {
  if (state === "neutral") return "";
  const stateMap = ACKNOWLEDGMENTS[state];
  return (domain && stateMap[domain]) || stateMap._default;
}

// ---------------------------------------------------------------------------
// Safety resources: domain-specific contacts
// ---------------------------------------------------------------------------

const SAFETY_RESOURCES: Record<string, string[]> = {
  safesport: [
    "U.S. Center for SafeSport: 833-5US-SAFE (833-587-7233) — safesport.org",
    "USOPC Mental Health Support: 1-888-602-9002",
  ],
  anti_doping: [
    "USADA: 1-866-601-2632 — usada.org",
    "USOPC Mental Health Support: 1-888-602-9002",
  ],
  dispute_resolution: [
    "Athlete Ombuds: 719-866-5000 — ombudsman@usathlete.org",
    "USOPC Mental Health Support: 1-888-602-9002",
  ],
  team_selection: [
    "Athlete Ombuds: 719-866-5000 — ombudsman@usathlete.org",
    "USOPC Mental Health Support: 1-888-602-9002",
  ],
  eligibility: [
    "Athlete Ombuds: 719-866-5000 — ombudsman@usathlete.org",
    "USOPC Mental Health Support: 1-888-602-9002",
  ],
  governance: [
    "Athlete Ombuds: 719-866-5000 — ombudsman@usathlete.org",
    "USOPC Mental Health Support: 1-888-602-9002",
  ],
  athlete_rights: [
    "Athlete Ombuds: 719-866-5000 — ombudsman@usathlete.org",
    "USOPC Mental Health Support: 1-888-602-9002",
  ],
  _default: ["USOPC Mental Health Support: 1-888-602-9002"],
};

/**
 * Returns domain-relevant safety resources (hotlines, contacts).
 * All domains include the USOPC Mental Health Support line.
 */
export function getSafetyResources(domain?: TopicDomain): string[] {
  return (domain && SAFETY_RESOURCES[domain]) || SAFETY_RESOURCES._default;
}

// ---------------------------------------------------------------------------
// Tone modifiers: instructions for the synthesizer
// ---------------------------------------------------------------------------

const TONE_MODIFIERS: Record<NonNeutralState, string[]> = {
  distressed: [
    "Use a warm, supportive tone throughout your response",
    "Acknowledge the athlete's feelings before providing procedural information",
    "Avoid cold, bureaucratic language",
    "Frame action steps as empowering options, not obligations",
    "Use person-first language and express genuine care",
  ],
  panicked: [
    "Use calm, reassuring language to reduce overwhelm",
    "Emphasize that concrete steps exist and the situation can be addressed",
    "Present information in a clear, numbered sequence",
    "Avoid alarming language or worst-case scenarios",
    "Reinforce that there is time to act and support available",
  ],
  fearful: [
    "Emphasize confidentiality protections and anti-retaliation provisions",
    "Use reassuring language about the athlete's rights and safety",
    "Frame reporting options as safe and protected actions",
    "Avoid language that could increase anxiety about consequences",
    "Highlight that many athletes have successfully raised similar concerns",
  ],
};

/**
 * Returns tone modifier instructions for the synthesizer when the user
 * is in a non-neutral emotional state.
 */
export function getToneModifiers(state: EmotionalState): string[] {
  if (state === "neutral") return [];
  return TONE_MODIFIERS[state];
}

// ---------------------------------------------------------------------------
// Guidance: situation-specific support language
// ---------------------------------------------------------------------------

const GUIDANCE: Record<NonNeutralState, Record<string, string>> = {
  distressed: {
    safesport:
      "This is a SafeSport matter, and your well-being is the priority. " +
      "The U.S. Center for SafeSport provides confidential reporting and support. " +
      "If you are a mandatory reporter, you are required to report — but support is " +
      "available to help you through the process. You do not have to face this alone.",
    anti_doping:
      "Anti-doping processes have specific timelines and protections for athletes. " +
      "You have the right to an advisor or representative throughout. USADA provides " +
      "resources to help you understand the process and your options.",
    dispute_resolution:
      "Dispute resolution processes are designed to be fair to all parties. " +
      "The Athlete Ombuds can help you understand your options and guide you through " +
      "the process confidentially. You have the right to be heard.",
    _default:
      "Support is available to help you through this situation. " +
      "The USOPC Athlete Services team and the Athlete Ombuds are here to help. " +
      "You do not have to navigate this alone.",
  },
  panicked: {
    safesport:
      "Here are the immediate steps you can take: (1) If anyone is in danger, call 911. " +
      "(2) Contact the U.S. Center for SafeSport at 833-5US-SAFE to report. " +
      "(3) Reach out to the Athlete Ombuds for confidential guidance. " +
      "Reports can be made anonymously, and you are protected from retaliation.",
    anti_doping:
      "Here's what you need to know right now: (1) You have the right to request a B-sample " +
      "analysis. (2) Contact USADA to understand your timeline. (3) You can request a " +
      "rights advisor to help you navigate the process. Deadlines matter, so let's " +
      "make sure you know your key dates.",
    dispute_resolution:
      "Here are the concrete steps you can take: (1) Document everything related to your " +
      "dispute. (2) Contact the Athlete Ombuds for confidential guidance. (3) Review the " +
      "applicable grievance procedures for your NGB. There are defined timelines, and " +
      "knowing them will help you plan.",
    _default:
      "Let me help you identify the concrete steps you can take right now. " +
      "The Athlete Ombuds at 719-866-5000 can provide immediate, confidential guidance. " +
      "There are defined processes and protections available to you.",
  },
  fearful: {
    safesport:
      "Federal law (the Protecting Young Victims from Sexual Abuse and Safe Sport " +
      "Authorization Act) prohibits retaliation against anyone who reports SafeSport " +
      "concerns. Reports can be made confidentially through the U.S. Center for SafeSport. " +
      "The Athlete Ombuds can also provide confidential guidance before you decide to report.",
    anti_doping:
      "Anti-doping proceedings include confidentiality protections. Your case details are " +
      "not made public unless you choose to disclose them. You have the right to " +
      "representation, and USADA provides resources for athletes going through this process.",
    dispute_resolution:
      "Dispute resolution processes include confidentiality provisions to protect all parties. " +
      "Anti-retaliation protections mean your NGB cannot take adverse action against you " +
      "for filing a grievance. The Athlete Ombuds can guide you confidentially.",
    _default:
      "You are protected from retaliation for raising concerns. Confidential reporting " +
      "channels exist, and the Athlete Ombuds can provide guidance without disclosing " +
      "your identity until you are ready.",
  },
};

/**
 * Returns situation-specific guidance based on emotional state and domain.
 */
export function getGuidance(
  state: EmotionalState,
  domain?: TopicDomain,
): string {
  if (state === "neutral") return "";
  const stateMap = GUIDANCE[state];
  return (domain && stateMap[domain]) || stateMap._default;
}
