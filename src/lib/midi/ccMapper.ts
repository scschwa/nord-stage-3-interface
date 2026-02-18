import ccMap from "../../assets/nord-cc-map.json";

export interface CCInfo {
  name: string;
  section: string;
  range: string;
}

const controllers = ccMap.controllers as Record<string, CCInfo>;

export function getCCInfo(ccNumber: number): CCInfo | null {
  return controllers[String(ccNumber)] ?? null;
}

export function getCCName(ccNumber: number): string {
  return controllers[String(ccNumber)]?.name ?? `CC ${ccNumber}`;
}

export function getCCsBySection(section: string): Array<{ cc: number } & CCInfo> {
  return Object.entries(controllers)
    .filter(([, info]) => info.section === section)
    .map(([cc, info]) => ({ cc: parseInt(cc), ...info }));
}
