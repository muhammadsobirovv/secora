import type { UpsertKnowledgeBaseReferenceEntryInput } from '../domain/repositories/knowledge-base-reference.repository.interface.js';

/// The AI Knowledge Base's baseline catalog (task #227) — a curated
/// starter set for each of the five *static* frameworks (OWASP/CWE/CAPEC/
/// MITRE_ATTACK/NIST). CVE is deliberately not seeded here: CVEs aren't a
/// fixed enumerable set the way OWASP Top 10 is, so CVE entries are meant
/// to be upserted ad hoc as agents (chiefly ExploitAnalysisAgent) research
/// specific ones — this repository's `upsert()` is exactly how that
/// happens, no separate code path needed. Summaries are intentionally
/// short (1-3 sentences): this is an index for semantic retrieval and
/// quick agent citation, not a replacement for the source standard.
export const KNOWLEDGE_BASE_REFERENCE_SEED_DATA: UpsertKnowledgeBaseReferenceEntryInput[] = [
  // --- OWASP Top 10:2021 (Web Application Security Risks) ---
  {
    framework: 'OWASP',
    code: 'A01:2021',
    title: 'Broken Access Control',
    summary:
      'Restrictions on what authenticated users are allowed to do are not properly enforced, letting attackers act outside their intended permissions — e.g. accessing other users’ accounts, viewing sensitive files, or modifying data. Moved up from 5th place in 2017 to the top risk in 2021.',
    url: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
  },
  {
    framework: 'OWASP',
    code: 'A02:2021',
    title: 'Cryptographic Failures',
    summary:
      'Failures related to cryptography (or its absence) that often lead to exposure of sensitive data — weak or missing encryption in transit/at rest, use of deprecated hash/cipher algorithms, hard-coded keys. Previously named "Sensitive Data Exposure", a symptom rather than a root cause.',
    url: 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
  },
  {
    framework: 'OWASP',
    code: 'A03:2021',
    title: 'Injection',
    summary:
      'Untrusted data is sent to an interpreter as part of a command or query (SQL, NoSQL, OS command, LDAP, ORM), altering its intended execution. Includes Cross-Site Scripting (XSS), now folded into this category.',
    url: 'https://owasp.org/Top10/A03_2021-Injection/',
  },
  {
    framework: 'OWASP',
    code: 'A04:2021',
    title: 'Insecure Design',
    summary:
      'Risks stemming from missing or ineffective security controls at the design/architecture stage, distinct from implementation bugs — e.g. no threat modeling, missing rate limiting by design. A new 2021 category emphasizing "shift left" secure-by-design practices.',
    url: 'https://owasp.org/Top10/A04_2021-Insecure_Design/',
  },
  {
    framework: 'OWASP',
    code: 'A05:2021',
    title: 'Security Misconfiguration',
    summary:
      'Missing security hardening, improperly configured permissions, unnecessary features enabled, default accounts/passwords left active, verbose error messages leaking stack traces, or out-of-date software — across any layer of the application stack.',
    url: 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/',
  },
  {
    framework: 'OWASP',
    code: 'A06:2021',
    title: 'Vulnerable and Outdated Components',
    summary:
      'Using components (libraries, frameworks, OS, runtime) with known vulnerabilities, or that are unsupported/out of date, without tracking versions or scanning for CVEs — expands on the 2017 "Using Components with Known Vulnerabilities" risk.',
    url: 'https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/',
  },
  {
    framework: 'OWASP',
    code: 'A07:2021',
    title: 'Identification and Authentication Failures',
    summary:
      'Weaknesses in confirming a user’s identity, authentication, or session management — permitting credential stuffing, brute force, weak/default passwords, missing MFA, or exposed session IDs. Previously named "Broken Authentication".',
    url: 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
  },
  {
    framework: 'OWASP',
    code: 'A08:2021',
    title: 'Software and Data Integrity Failures',
    summary:
      'Code and infrastructure that does not protect against integrity violations — e.g. auto-update mechanisms without signature verification, insecure deserialization, or CI/CD pipelines lacking integrity checks allowing unauthorized code/config changes.',
    url: 'https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/',
  },
  {
    framework: 'OWASP',
    code: 'A09:2021',
    title: 'Security Logging and Monitoring Failures',
    summary:
      'Insufficient logging, detection, monitoring, and active incident response — breaches routinely take months to detect, and without adequate logging/alerting attackers can pivot to further systems undetected.',
    url: 'https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/',
  },
  {
    framework: 'OWASP',
    code: 'A10:2021',
    title: 'Server-Side Request Forgery (SSRF)',
    summary:
      'An application fetches a remote resource using a user-supplied URL without validating the destination, letting an attacker coerce the server into making requests to unintended internal/external destinations (e.g. cloud metadata endpoints). A new 2021 category.',
    url: 'https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/',
  },

  // --- CWE (Common Weakness Enumeration) — frequently-cited entries ---
  {
    framework: 'CWE',
    code: 'CWE-79',
    title: 'Improper Neutralization of Input During Web Page Generation (Cross-site Scripting)',
    summary:
      'The software does not neutralize or incorrectly neutralizes user-controllable input before it is placed in output used as a web page served to other users, allowing attacker-controlled script to execute in a victim’s browser.',
    url: 'https://cwe.mitre.org/data/definitions/79.html',
  },
  {
    framework: 'CWE',
    code: 'CWE-89',
    title: 'Improper Neutralization of Special Elements used in an SQL Command (SQL Injection)',
    summary:
      'The software constructs SQL commands using externally-influenced input without neutralizing special elements, letting an attacker modify the intended SQL command’s structure and logic.',
    url: 'https://cwe.mitre.org/data/definitions/89.html',
  },
  {
    framework: 'CWE',
    code: 'CWE-78',
    title: 'Improper Neutralization of Special Elements used in an OS Command (OS Command Injection)',
    summary:
      'The software constructs an OS command using externally-influenced input without neutralizing elements that could modify the intended command, allowing execution of unintended, attacker-controlled commands.',
    url: 'https://cwe.mitre.org/data/definitions/78.html',
  },
  {
    framework: 'CWE',
    code: 'CWE-20',
    title: 'Improper Input Validation',
    summary:
      'The product does not validate or incorrectly validates input that can affect the control flow or data flow of a program — a root-cause weakness underlying many more specific injection/overflow issues.',
    url: 'https://cwe.mitre.org/data/definitions/20.html',
  },
  {
    framework: 'CWE',
    code: 'CWE-22',
    title: 'Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)',
    summary:
      'The software uses external input to construct a pathname without properly neutralizing sequences such as "../" that resolve to a location outside of the restricted directory, allowing access to unintended files.',
    url: 'https://cwe.mitre.org/data/definitions/22.html',
  },
  {
    framework: 'CWE',
    code: 'CWE-352',
    title: 'Cross-Site Request Forgery (CSRF)',
    summary:
      'The web application does not, or cannot, sufficiently verify a well-formed, valid, consistent request originated from the user who submitted it, allowing an attacker to trick a victim’s browser into issuing unwanted state-changing requests.',
    url: 'https://cwe.mitre.org/data/definitions/352.html',
  },
  {
    framework: 'CWE',
    code: 'CWE-434',
    title: 'Unrestricted Upload of File with Dangerous Type',
    summary:
      'The software allows an attacker to upload or transfer files of dangerous types (e.g. executable scripts) that can be automatically processed within the product’s environment, potentially leading to remote code execution.',
    url: 'https://cwe.mitre.org/data/definitions/434.html',
  },
  {
    framework: 'CWE',
    code: 'CWE-862',
    title: 'Missing Authorization',
    summary:
      'The software does not perform an authorization check when an actor attempts to access a resource or perform an action, distinct from CWE-287 (Improper Authentication) — the identity may be verified correctly, but permissions are never checked.',
    url: 'https://cwe.mitre.org/data/definitions/862.html',
  },
  {
    framework: 'CWE',
    code: 'CWE-306',
    title: 'Missing Authentication for Critical Function',
    summary:
      'The software does not perform any authentication for functionality that requires a provable user identity or consumes significant resources, allowing unauthenticated attackers to invoke sensitive operations directly.',
    url: 'https://cwe.mitre.org/data/definitions/306.html',
  },
  {
    framework: 'CWE',
    code: 'CWE-798',
    title: 'Use of Hard-coded Credentials',
    summary:
      'The software contains hard-coded credentials (passwords, cryptographic keys) used for its own inbound/outbound authentication or internal data encryption, making them trivially recoverable from source, binaries, or configuration.',
    url: 'https://cwe.mitre.org/data/definitions/798.html',
  },

  // --- CAPEC (Common Attack Pattern Enumeration and Classification) ---
  {
    framework: 'CAPEC',
    code: 'CAPEC-66',
    title: 'SQL Injection',
    summary:
      'An attacker crafts input containing SQL syntax intended to be interpreted as part of a database query, exploiting a downstream target that does not properly validate/sanitize input, to read, modify, or destroy data or gain broader system access.',
    url: 'https://capec.mitre.org/data/definitions/66.html',
  },
  {
    framework: 'CAPEC',
    code: 'CAPEC-63',
    title: 'Cross-Site Scripting (XSS)',
    summary:
      'An attacker embeds malicious script content in a request that is echoed back unsanitized by a web application, causing the script to execute in the browser context of other users who later view the resulting page.',
    url: 'https://capec.mitre.org/data/definitions/63.html',
  },
  {
    framework: 'CAPEC',
    code: 'CAPEC-88',
    title: 'OS Command Injection',
    summary:
      'An attacker exploits improper neutralization of input to inject OS commands that a vulnerable application passes to a system shell, achieving arbitrary command execution with the privileges of the vulnerable process.',
    url: 'https://capec.mitre.org/data/definitions/88.html',
  },
  {
    framework: 'CAPEC',
    code: 'CAPEC-1',
    title: 'Accessing Functionality Not Properly Constrained by ACLs',
    summary:
      'An attacker accesses functionality that is not properly constrained by access control lists, typically by directly invoking an internal/unlinked URL or API endpoint that lacks its own authorization check, bypassing the UI’s enforced restrictions.',
    url: 'https://capec.mitre.org/data/definitions/1.html',
  },
  {
    framework: 'CAPEC',
    code: 'CAPEC-115',
    title: 'Authentication Bypass',
    summary:
      'An attacker circumvents an authentication mechanism to gain access to a system without holding valid credentials — via direct object access, parameter tampering, session-fixation, or exploiting logic flaws in the auth flow itself.',
    url: 'https://capec.mitre.org/data/definitions/115.html',
  },

  // --- MITRE ATT&CK (Enterprise Matrix) ---
  {
    framework: 'MITRE_ATTACK',
    code: 'T1190',
    title: 'Exploit Public-Facing Application',
    summary:
      'Adversaries exploit a weakness in an Internet-facing computer or program (websites, databases, standard services) using software, data, or commands to cause unintended/unanticipated behavior, gaining Initial Access to a network.',
    url: 'https://attack.mitre.org/techniques/T1190/',
  },
  {
    framework: 'MITRE_ATTACK',
    code: 'T1078',
    title: 'Valid Accounts',
    summary:
      'Adversaries obtain and abuse credentials of existing accounts as a means of gaining Initial Access, Persistence, Privilege Escalation, or Defense Evasion, often evading detection since the activity looks like normal user behavior.',
    url: 'https://attack.mitre.org/techniques/T1078/',
  },
  {
    framework: 'MITRE_ATTACK',
    code: 'T1059',
    title: 'Command and Scripting Interpreter',
    summary:
      'Adversaries abuse command and script interpreters (PowerShell, Unix shells, Python, JavaScript, etc.) to execute commands, scripts, or binaries, a common Execution technique across nearly every intrusion.',
    url: 'https://attack.mitre.org/techniques/T1059/',
  },
  {
    framework: 'MITRE_ATTACK',
    code: 'T1003',
    title: 'OS Credential Dumping',
    summary:
      'Adversaries attempt to dump credentials to obtain account login/hash information from the OS and software (e.g. LSASS memory, SAM database, /etc/shadow) to enable Lateral Movement using legitimate credentials.',
    url: 'https://attack.mitre.org/techniques/T1003/',
  },
  {
    framework: 'MITRE_ATTACK',
    code: 'T1486',
    title: 'Data Encrypted for Impact',
    summary:
      'Adversaries encrypt data on target systems or on large numbers of systems in a network to interrupt availability, typically to extort a ransom payment (ransomware) as the final Impact-stage action of an intrusion.',
    url: 'https://attack.mitre.org/techniques/T1486/',
  },
  {
    framework: 'MITRE_ATTACK',
    code: 'T1566',
    title: 'Phishing',
    summary:
      'Adversaries send phishing messages to gain access to victim systems — spearphishing attachments, links, or third-party services — the most common Initial Access technique observed across intrusions.',
    url: 'https://attack.mitre.org/techniques/T1566/',
  },
  {
    framework: 'MITRE_ATTACK',
    code: 'T1021',
    title: 'Remote Services',
    summary:
      'Adversaries use valid accounts to log into a remote service (RDP, SSH, VNC, SMB/Windows Admin Shares) that accepts them for the purpose of Lateral Movement within a network.',
    url: 'https://attack.mitre.org/techniques/T1021/',
  },

  // --- NIST Cybersecurity Framework (Core Functions) ---
  {
    framework: 'NIST',
    code: 'ID',
    title: 'Identify',
    summary:
      'Develop an organizational understanding to manage cybersecurity risk to systems, assets, data, and capabilities — asset management, business environment, governance, risk assessment, and risk management strategy.',
    url: 'https://www.nist.gov/cyberframework',
  },
  {
    framework: 'NIST',
    code: 'PR',
    title: 'Protect',
    summary:
      'Develop and implement appropriate safeguards to ensure delivery of critical services — identity management and access control, awareness/training, data security, maintenance, and protective technology.',
    url: 'https://www.nist.gov/cyberframework',
  },
  {
    framework: 'NIST',
    code: 'DE',
    title: 'Detect',
    summary:
      'Develop and implement appropriate activities to identify the occurrence of a cybersecurity event in a timely manner — anomalies and events, continuous security monitoring, and detection processes.',
    url: 'https://www.nist.gov/cyberframework',
  },
  {
    framework: 'NIST',
    code: 'RS',
    title: 'Respond',
    summary:
      'Develop and implement appropriate activities to take action regarding a detected cybersecurity incident — response planning, communications, analysis, mitigation, and improvements.',
    url: 'https://www.nist.gov/cyberframework',
  },
  {
    framework: 'NIST',
    code: 'RC',
    title: 'Recover',
    summary:
      'Develop and implement appropriate activities to maintain plans for resilience and to restore capabilities or services impaired by a cybersecurity incident — recovery planning, improvements, and communications.',
    url: 'https://www.nist.gov/cyberframework',
  },
];
