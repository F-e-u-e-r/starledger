import { z } from 'zod';
import { SUMMARY_MAX_LENGTH, SUMMARY_MIN_LENGTH } from './taxonomy';

function hasCanonicalControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function hasRawTextControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/**
 * Bidi controls, zero-width characters, and C1 controls are invisible or
 * reading-direction-altering. They slip past the C0/DEL check above (they are
 * all > 127), yet a malicious starred README that steers the classifier could
 * smuggle one into `summary` — the one attacker-influenceable free-text field
 * rendered under the authoritative "AI" badge in the owner's dashboard (SEC-A).
 * U+202E can visually reverse a summary; zero-width chars can hide or split
 * text past a substring search. This is defence-in-depth to match the codebase
 * blocking C0 everywhere else.
 *
 * U+200C/U+200D (ZWNJ/ZWJ) are deliberately NOT rejected: they are legitimate
 * in Arabic/Persian shaping and in emoji ZWJ sequences.
 */
function hasUnsafeFormatCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code === 0x061c || // ARABIC LETTER MARK
      code === 0x200b || // ZERO WIDTH SPACE
      code === 0x200e || // LEFT-TO-RIGHT MARK
      code === 0x200f || // RIGHT-TO-LEFT MARK
      (code >= 0x202a && code <= 0x202e) || // bidi embeddings + overrides (incl. RLO)
      code === 0x2060 || // WORD JOINER
      (code >= 0x2066 && code <= 0x2069) || // bidi isolates
      code === 0xfeff || // ZERO WIDTH NO-BREAK SPACE / BOM
      (code >= 0x0080 && code <= 0x009f) // C1 controls (incl. NEL U+0085)
    ) {
      return true;
    }
  }
  return false;
}

export const UtcTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => value.endsWith('Z'), {
    message: 'must be a UTC timestamp ending in Z',
  });

/**
 * Opaque Git object id from GitHub README metadata. It may be SHA-1 or SHA-256
 * depending on repository/storage evolution; it is not StarLedger's own SHA-256
 * fingerprint.
 */
export const GitObjectOidSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => !hasCanonicalControlCharacter(value), {
    message: 'must not contain control characters',
  });

export function normalizeSummary(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}

export const RawSummarySchema = z
  .string()
  .min(1)
  .max(2_000)
  .refine((value) => !hasRawTextControlCharacter(value), {
    message: 'summary must not contain control characters',
  });

export const CanonicalSummarySchema = z
  .string()
  .min(SUMMARY_MIN_LENGTH)
  .max(SUMMARY_MAX_LENGTH)
  .refine((value) => !hasCanonicalControlCharacter(value), {
    message: 'summary must not contain control characters',
  })
  .refine((value) => !hasUnsafeFormatCharacter(value), {
    message: 'summary must not contain bidi, zero-width, or C1 format characters',
  })
  .refine((value) => value === normalizeSummary(value), {
    message: 'summary must be normalized',
  });

export function normalizeOptionalModelLabel(value: string | null): string | null {
  if (value === null) return null;
  return value
    .normalize('NFC')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export const RawModelLabelSchema = z
  .string()
  .min(1)
  .max(256)
  .nullable()
  .refine((value) => value === null || !hasCanonicalControlCharacter(value), {
    message: 'model_label must not contain control characters',
  });

export const OptionalModelLabelSchema = z
  .string()
  .min(1)
  .max(128)
  .nullable()
  .refine((value) => value === null || !hasCanonicalControlCharacter(value), {
    message: 'model_label must not contain control characters',
  })
  .refine((value) => value === null || !hasUnsafeFormatCharacter(value), {
    message: 'model_label must not contain bidi, zero-width, or C1 format characters',
  })
  .refine((value) => value === normalizeOptionalModelLabel(value), {
    message: 'model_label must be normalized',
  });
