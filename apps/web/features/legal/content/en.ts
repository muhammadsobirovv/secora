// DRAFT: requires review by a qualified Uzbekistan lawyer before launch.
// Everything in this file (and its uz/ru translations) is a working draft
// written to make the product's rules explicit; it is not legal advice and
// has not been reviewed. Items that especially need the lawyer's attention
// are marked "LEGAL REVIEW" below.
import { LEGAL_CONTACT } from "@pentesthub/shared";
import type { LegalCatalog } from "./types";

const S = LEGAL_CONTACT.support;
const SEC = LEGAL_CONTACT.security;

export const en: LegalCatalog = {
  terms: {
    title: "Terms of Service",
    intro:
      "These Terms govern your use of PentestHub AI (the \"Service\"), operated from the Republic of Uzbekistan. By creating an account or using the Service you agree to these Terms, the Acceptable Use Policy and the Privacy Policy.",
    sections: [
      {
        heading: "1. Authorized security testing only",
        paragraphs: [
          "The Service is a toolkit for authorized security testing. You may use it only against assets you own, or for which you hold explicit, written and current authorization from the owner — for example a signed contract, signed Rules of Engagement (ROE), or the published scope and safe-harbor terms of a bug bounty program.",
          "You must stay inside the authorized scope, time window and testing methods. Any activity outside the ROE or program scope is prohibited.",
        ],
      },
      {
        heading: "2. Your responsibility",
        paragraphs: [
          "If you test without authorization, or outside the agreed ROE or scope, you act entirely at your own risk and accept full legal responsibility — civil, administrative and criminal — for your actions.",
          "The Service provides tooling only. It does not verify your authorization on your behalf (except where a verification feature is explicitly enabled), and we are not liable for how you use it. You are responsible for complying with the laws of the country where you are and of the countries where your targets are located.",
        ],
      },
      {
        heading: "3. Accounts",
        paragraphs: [
          "You must provide accurate information, keep your credentials secure and tell us promptly about any unauthorized use of your account. You are responsible for all activity under your account, including actions taken by members you invite to your workspace and by your API keys.",
        ],
      },
      {
        heading: "4. Records we keep",
        paragraphs: [
          "To protect the Service and investigate abuse, we keep audit records, including when and from which IP address you accepted these Terms, the authorization you declared for each target, and when scans were started. Details are in the Privacy Policy.",
        ],
      },
      {
        heading: "5. Suspension and termination",
        paragraphs: [
          "We may suspend or terminate accounts, block scans or targets, and remove content when we reasonably believe these Terms or the Acceptable Use Policy have been breached, or when required by law. We may cooperate with lawful requests from competent authorities and disclose relevant records to them.",
        ],
      },
      {
        heading: "6. Third-party services",
        paragraphs: [
          "Some features use third-party services you choose, such as sign-in with Google or GitHub, or an AI provider you connect with your own API key. Your use of those services is governed by their own terms.",
        ],
      },
      {
        heading: "7. Disclaimer and limitation of liability",
        paragraphs: [
          "The Service is provided \"as is\" and \"as available\", without warranties of any kind. Scan results can be incomplete or wrong and must be verified.",
          "To the maximum extent permitted by law, we are not liable for indirect, incidental or consequential damages, loss of data, profits or business, or for damage caused by your use of the Service against any system. Our total liability for any claim is limited to the amount you paid us for the Service in the 12 months before the claim. (LEGAL REVIEW)",
        ],
      },
      {
        heading: "8. Indemnification",
        paragraphs: [
          "You agree to indemnify and hold harmless PentestHub AI and its operators from any claims, damages, fines and costs (including reasonable legal fees) arising from your use of the Service, your testing activity, or your breach of these Terms or the law. (LEGAL REVIEW)",
        ],
      },
      {
        heading: "9. Changes",
        paragraphs: [
          "We may update these Terms. When we make a material change, the version number changes and you will be asked to review and accept the new version before you can continue using the Service.",
        ],
      },
      {
        heading: "10. Governing law",
        paragraphs: [
          "These Terms are governed by the laws of the Republic of Uzbekistan, and disputes are subject to the competent courts of the Republic of Uzbekistan, unless mandatory law where you live provides otherwise. (LEGAL REVIEW)",
        ],
      },
      {
        heading: "11. Contact",
        paragraphs: [`Questions about these Terms: ${S}. Security vulnerabilities in the Service: ${SEC}.`],
      },
    ],
  },
  aup: {
    title: "Acceptable Use Policy & Rules of Engagement",
    intro:
      "This policy explains what you may and may not do with PentestHub AI. It is part of the Terms of Service. If anything here is unclear, ask before you test.",
    sections: [
      {
        heading: "1. Authorization comes first",
        paragraphs: [
          "Test only assets you own, or for which you hold explicit, written and current authorization from the owner (contract, signed ROE, or a bug bounty program's published scope and safe harbor). Record the basis of your authorization for every target in the Service and keep it up to date.",
        ],
      },
      {
        heading: "2. Rules of Engagement",
        list: [
          "Stay inside the authorized assets, time window and methods.",
          "Stop and ask the owner if you are unsure whether something is in scope.",
          "Use the minimum intensity needed; avoid degrading the target's availability.",
          "Collect only the proof of concept needed to demonstrate an issue.",
          "Report findings only to the owner or through the program's official channel.",
        ],
      },
      {
        heading: "3. Prohibited activities",
        list: [
          "Accessing systems or data without authorization.",
          "Denial-of-service, load or stress testing without explicit written permission.",
          "Exfiltrating, changing or deleting data beyond a minimal proof of concept.",
          "Social engineering or phishing of people who have not agreed to it.",
          "Targeting critical infrastructure, government or military systems without written authorization from the responsible authority.",
          "Testing third-party services that a target merely uses (payment, email, cloud or SaaS providers) without their own authorization.",
          "Using the Service for extortion, ransomware, malware, spam, or to attack the Service itself.",
          "Sharing your account or reselling access to the Service.",
        ],
      },
      {
        heading: "4. Built-in safeguards",
        paragraphs: [
          "Active scans require a valid, unexpired authorization on the target. The hosted Service does not actively scan private or internal network ranges, localhost or cloud metadata addresses, and by default refuses certain government and military domains. Owners who need such an asset tested can contact us. These safeguards reduce mistakes; they do not replace your own authorization.",
        ],
      },
      {
        heading: "5. If something goes wrong",
        paragraphs: [
          "If you accidentally access personal or sensitive data, stop, do not keep a copy and inform the owner. If you cause an outage, stop testing and contact the owner immediately.",
        ],
      },
      {
        heading: "6. Enforcement",
        paragraphs: [
          "Breaches may lead to blocked scans, suspension or termination of your account, and, where required or appropriate, reporting to the competent authorities. We keep audit records to investigate abuse.",
        ],
      },
      {
        heading: "7. Reporting abuse",
        paragraphs: [`To report abuse of the Service, email ${S}.`],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro:
      "This policy explains what personal data PentestHub AI processes, why, and the rights you have. (LEGAL REVIEW: confirm alignment with the Law of the Republic of Uzbekistan \"On Personal Data\" and data-localization requirements.)",
    sections: [
      {
        heading: "1. Data we collect",
        list: [
          "Account data: name, email address, password hash, sign-in provider (Google or GitHub) identifiers, MFA settings.",
          "Workspace data: projects, targets, notes, evidence, findings, reports and team membership.",
          "Scan data: tool output and results of recon and vulnerability scans you run.",
          "Security and audit records: sign-ins, IP addresses, user agents, legal acceptances, target authorization declarations and scan starts.",
          "Technical data needed to operate the Service, such as logs and error reports.",
        ],
      },
      {
        heading: "2. Why we use it",
        list: [
          "To provide and secure the Service and your account.",
          "To enforce the Terms and Acceptable Use Policy and investigate abuse.",
          "To comply with legal obligations and lawful requests from authorities.",
          "To contact you about your account and important changes.",
        ],
      },
      {
        heading: "3. Processors and third parties",
        paragraphs: [
          "We use infrastructure and service providers to run the Service. When you sign in with Google or GitHub, those providers process your sign-in. When you enable Cloud or Hybrid AI mode with your own API key, the content you send to the AI copilot is processed by the AI provider you chose (for example OpenAI, Anthropic, Google or OpenRouter) under their terms. In Local mode, AI requests go only to a model you host.",
          "We do not sell your personal data.",
        ],
      },
      {
        heading: "4. Where data is stored",
        paragraphs: [
          "Service data is stored on servers operated for PentestHub AI by our hosting provider. Data you send to third-party AI providers may be processed in other countries. (LEGAL REVIEW: state the hosting region and the legal basis for any cross-border transfer.)",
        ],
      },
      {
        heading: "5. Retention",
        paragraphs: [
          "We keep account and workspace data while your account is active. When you delete your account, we delete or anonymize your data within a reasonable period, except audit records (legal acceptances, target authorizations, scan starts), which we keep for as long as needed to investigate abuse and meet legal obligations. (LEGAL REVIEW: set concrete retention periods.)",
        ],
      },
      {
        heading: "6. Your rights",
        paragraphs: [
          `You can request access to, correction of, export of, or deletion of your personal data. Data export and account deletion are available through the API, or email ${S}. We may need to verify your identity before acting on a request.`,
        ],
      },
      {
        heading: "7. Security",
        paragraphs: [
          `We protect data with encryption in transit, encryption at rest for secrets such as API keys, access controls and audit logging. Report vulnerabilities to ${SEC}.`,
        ],
      },
      {
        heading: "8. Contact",
        paragraphs: [`Privacy questions and requests: ${S}.`],
      },
    ],
  },
  security: {
    title: "Vulnerability Disclosure Policy",
    intro:
      "We welcome reports from security researchers. This policy explains how to report a vulnerability in PentestHub AI and what you can expect from us.",
    sections: [
      {
        heading: "How to report",
        paragraphs: [
          `Email ${SEC} or use "Report a vulnerability" (private advisory) on our GitHub repository. Please do not open a public issue. Include the affected URL or component, steps to reproduce, the impact and any proof of concept. Our machine-readable contact details are published at /.well-known/security.txt.`,
        ],
      },
      {
        heading: "What we commit to",
        list: [
          "Acknowledge your report within 5 business days.",
          "Keep you informed while we investigate and fix the issue.",
          "Coordinate public disclosure with you once a fix is available.",
          "Credit you in the advisory if you wish.",
        ],
      },
      {
        heading: "Rules for testing our platform",
        list: [
          "Use only your own accounts and data.",
          "No denial-of-service, spam, or social engineering of our staff or users.",
          "Do not access, change or delete other users' data. Stop as soon as you can demonstrate impact.",
          "Give us a reasonable time to fix the issue before any public disclosure.",
        ],
      },
      {
        heading: "Safe harbor",
        paragraphs: [
          "If you act in good faith and follow this policy, we will consider your research authorized and will not initiate legal action against you for it. (LEGAL REVIEW)",
        ],
      },
      {
        heading: "Out of scope",
        list: [
          "Findings from automated scanners without a demonstrated impact.",
          "Missing best-practice headers or settings without a concrete exploit.",
          "Issues in third-party services we use, which should be reported to those vendors.",
        ],
      },
    ],
  },
};
