import { parse as parseYaml } from 'yaml';

/**
 * Neutralize the `schedule:` trigger of a workflow for the template. The
 * original lines (including the cron) are preserved as comments so the user can
 * re-enable automation deliberately after `setup:doctor` passes — honoring the
 * opt-in invariant that nothing fires on a fresh repo before secrets are set.
 */

function leadingSpaces(line: string): number {
  const m = /^( *)/.exec(line);
  return m?.[1]?.length ?? 0;
}

/** Collect every `uses:` value anywhere in a parsed workflow tree. */
function collectUses(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectUses(item, out);
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'uses' && typeof value === 'string') out.push(value);
      else collectUses(value, out);
    }
  }
}

/**
 * Return every `uses:` action ref in a workflow that is NOT pinned to a full
 * 40-hex commit SHA (S4). A mutable tag (`@v3`, `@main`) or branch lets the
 * action's code change under a fixed ref — a supply-chain risk, acute for the
 * publish-credential actions (see docs/adr/ADR-003-sha-pin-actions.md). Local
 * refs (`./…`, `../…`) are ours, so they are ignored; anything else whose ref
 * after the final `@` is not 40 hex chars is reported.
 *
 * This PARSES the YAML (rather than scanning lines) so every `uses` key form
 * (block, flow `{ uses: … }`, quoted key/value, `uses :`) is caught, while text
 * inside a `run:` script block is NOT mistaken for an action ref. An unparseable
 * workflow is itself a failure and is reported as such.
 */
export function findUnpinnedActionRefs(yaml: string): string[] {
  let doc: unknown;
  try {
    doc = parseYaml(yaml);
  } catch (err) {
    return [`<unparseable workflow: ${err instanceof Error ? err.message : String(err)}>`];
  }
  const uses: string[] = [];
  collectUses(doc, uses);
  return uses.filter((ref) => {
    if (ref.startsWith('./') || ref.startsWith('../')) return false; // local action / reusable workflow
    const at = ref.lastIndexOf('@');
    const pin = at >= 0 ? ref.slice(at + 1) : '';
    return !/^[0-9a-f]{40}$/.test(pin);
  });
}

export interface NeutralizeResult {
  text: string;
  changed: boolean;
}

export function neutralizeSchedule(yaml: string): NeutralizeResult {
  const lines = yaml.split('\n');
  const out: string[] = [];
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // A top-level `on:` mapping key `schedule:` is indented two spaces.
    if (/^ {2}schedule:\s*$/.test(line)) {
      const indent = leadingSpaces(line); // 2
      const block: string[] = [line];
      i++;
      // Capture the schedule body: deeper-indented, non-blank lines.
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (next.trim() === '' || leadingSpaces(next) <= indent) {
          i--; // re-examine this line in the outer loop
          break;
        }
        block.push(next);
        i++;
      }
      const pad = ' '.repeat(indent);
      out.push(`${pad}# Scheduled triggers are disabled in the template until you set secrets.`);
      out.push(`${pad}# Uncomment to re-enable (see docs/setup/), and run once manually first:`);
      for (const b of block) {
        out.push(b.trim() === '' ? '' : `${pad}# ${b.slice(indent)}`);
      }
      changed = true;
      continue;
    }
    out.push(line);
  }

  return { text: out.join('\n'), changed };
}
