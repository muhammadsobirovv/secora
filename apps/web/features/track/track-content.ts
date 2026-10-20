import type { MessageKey } from "@/features/i18n/catalog";
import type { Track } from "./track";

export const TRACK_SHORT: Record<Track, string> = { red: "Red", blue: "Blue" };

/// Message keys of one track, built once per track so every `t()` call stays
/// type-checked against the English catalog (a typo is a compile error).
export function trackKeys<T extends Track>(track: T) {
  const stage = (n: 1 | 2 | 3 | 4 | 5 | 6) =>
    [`track.${track}.s${n}t`, `track.${track}.s${n}d`] as const satisfies readonly MessageKey[];
  const mod = (n: 1 | 2 | 3 | 4 | 5 | 6) =>
    [`track.${track}.mod${n}t`, `track.${track}.mod${n}d`] as const satisfies readonly MessageKey[];
  const stat = (n: 1 | 2 | 3 | 4) =>
    [`track.${track}.st${n}v`, `track.${track}.st${n}l`] as const satisfies readonly MessageKey[];
  return {
    label: `track.${track}.label`,
    name: `track.${track}.name`,
    tagline: `track.${track}.tagline`,
    pick: `track.${track}.pick`,
    gate: [
      `track.${track}.g1`,
      `track.${track}.g2`,
      `track.${track}.g3`,
      `track.${track}.g4`,
      `track.${track}.g5`,
    ],
    chip: `track.${track}.chip`,
    heroPre: `track.${track}.heroPre`,
    heroGlow: `track.${track}.heroGlow`,
    lead: `track.${track}.lead`,
    scan: `track.${track}.scan`,
    fine: `track.${track}.fine`,
    flowTitle: `track.${track}.flowTitle`,
    modsTitle: `track.${track}.modsTitle`,
    stages: [stage(1), stage(2), stage(3), stage(4), stage(5), stage(6)],
    mods: [mod(1), mod(2), mod(3), mod(4), mod(5), mod(6)],
    stats: [stat(1), stat(2), stat(3), stat(4)],
    ctaTitle: `track.${track}.ctaTitle`,
    ctaText: `track.${track}.ctaText`,
    ctaButton: `track.${track}.ctaButton`,
    crossText: `track.${track}.crossText`,
    crossButton: `track.${track}.crossButton`,
  } as const satisfies Record<string, MessageKey | readonly (MessageKey | readonly MessageKey[])[]>;
}

export type StatusTone = "accent" | "ok";
export interface StatusItem {
  label: string;
  value: string;
  tone: StatusTone;
}

export type ConsoleTone = "ok" | "muted" | "high" | "med";
export interface ConsoleLine {
  time: string;
  tag: string;
  tone: ConsoleTone;
  text: string;
}

export interface TrackLiteral {
  /// Prompt shown in the hero command bar.
  prompt: string;
  /// Example target in the hero command bar (a domain or a wildcard).
  placeholder: string;
  /// Top status strip.
  status: readonly StatusItem[];
  /// Reticle callouts: text, CSS position, and whether it is the warning one.
  callouts: readonly { text: string; position: string; warn?: boolean }[];
  /// Live console: the command, then its output.
  consoleName: string;
  consoleCommand: string;
  consoleLines: readonly ConsoleLine[];
  /// Intro splash line.
  introLine: string;
}

/// Terminal / status text. Tool output, identical in every language, so it is
/// deliberately not routed through i18n (same rule as the landing terminal).
export const TRACK_LITERAL: Record<Track, TrackLiteral> = {
  red: {
    prompt: "root@secora:~#",
    placeholder: "target.uz",
    status: [
      { label: "", value: "OP-RED-1017", tone: "accent" },
      { label: "Scope", value: "LOCKED", tone: "accent" },
      { label: "ROE", value: "SIGNED", tone: "ok" },
      { label: "Operators online", value: "07", tone: "accent" },
    ],
    callouts: [
      { text: "T-01 // exposed .git", position: "top-[6%] right-[2%]" },
      { text: "T-02 // weak CSP", position: "bottom-[20%] left-0", warn: true },
      { text: "RNG 0.42km", position: "bottom-[2%] right-[6%]" },
    ],
    consoleName: "secora // op-red-1017",
    consoleCommand: "secora scan target.uz --roe signed",
    consoleLines: [
      { time: "12:04:19", tag: "[ok]", tone: "ok", text: "scope check passed: target.uz in-scope" },
      { time: "12:04:21", tag: "[info]", tone: "muted", text: "templates loaded: 8214" },
      { time: "12:04:27", tag: "[HIGH]", tone: "high", text: "exposed-git-config   https://target.uz/.git/config" },
      { time: "12:04:31", tag: "[MED]", tone: "med", text: "missing-csp-header   https://target.uz" },
      { time: "12:04:33", tag: "[info]", tone: "muted", text: "dns-caa-record       target.uz" },
      { time: "12:04:40", tag: "[done]", tone: "ok", text: "1 high · 1 medium · 4 info" },
    ],
    introLine: "initializing track // RED TEAM · offensive",
  },
  blue: {
    prompt: "monitor@secora:~#",
    placeholder: "*.company.uz",
    status: [
      { label: "", value: "SOC-BLUE-0417", tone: "accent" },
      { label: "Monitoring", value: "ACTIVE", tone: "ok" },
      { label: "Assets", value: "128", tone: "accent" },
      { label: "Open alerts", value: "03", tone: "accent" },
    ],
    callouts: [
      { text: "A-01 // dev.company.uz", position: "top-[6%] right-[2%]" },
      { text: "A-02 // port 8080", position: "bottom-[20%] left-0", warn: true },
      { text: "SLA 02:58h", position: "bottom-[2%] right-[6%]" },
    ],
    consoleName: "secora // soc-blue-0417",
    consoleCommand: "secora watch *.company.uz",
    consoleLines: [
      { time: "09:12:03", tag: "[ok]", tone: "ok", text: "128 assets in inventory" },
      { time: "09:12:41", tag: "[NEW]", tone: "med", text: "subdomain detected: dev.company.uz" },
      { time: "09:13:02", tag: "[ALERT]", tone: "high", text: "port 8080 exposed on dev.company.uz" },
      { time: "09:13:10", tag: "[intel]", tone: "muted", text: "indicator match: 203.0.113.7 (known scanner)" },
      { time: "09:13:22", tag: "[SLA]", tone: "med", text: "2 findings breach in 3h" },
      { time: "09:40:08", tag: "[done]", tone: "ok", text: "patch verified · incident INC-0417 closed" },
    ],
    introLine: "initializing track // BLUE TEAM · defensive",
  },
};
