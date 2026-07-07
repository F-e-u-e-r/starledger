import { describe, expect, it } from 'vitest';
import { AnnotationSchema } from '../src/annotation';
import { serializeAnnotations } from '../src/artifact';
import { buildAiAnnotationsMeta } from '../src/meta-build';
import { CanonicalSummarySchema, normalizeSummary, OptionalModelLabelSchema } from '../src/scalars';
import { makeAnnotation } from './helpers';

describe('AI scalar contracts', () => {
  it('TIME-1: accepts canonical UTC Z timestamps', () => {
    expect(
      AnnotationSchema.safeParse(
        makeAnnotation({
          generation: { ...makeAnnotation().generation, generated_at: '2026-06-20T12:34:56Z' },
        }),
      ).success,
    ).toBe(true);
    expect(() =>
      buildAiAnnotationsMeta({
        annotationsBytes: serializeAnnotations([makeAnnotation()]),
        annotationCount: 1,
        datasetSha256: 'c'.repeat(64),
        generatedAt: '2026-06-20T12:34:56Z',
      }),
    ).not.toThrow();
  });

  it('TIME-2/TIME-3/STRICT-2: rejects offsets, date-only values, and arbitrary text', () => {
    for (const generated_at of ['2026-06-20T20:34:56+08:00', '2026-06-20', 'tomorrow']) {
      expect(
        AnnotationSchema.safeParse({
          ...makeAnnotation(),
          generation: { ...makeAnnotation().generation, generated_at },
        }).success,
      ).toBe(false);
    }
  });

  it('TIME-4: serialization preserves normalized UTC Z timestamps', () => {
    const bytes = serializeAnnotations([
      makeAnnotation({
        generation: { ...makeAnnotation().generation, generated_at: '2026-06-20T12:34:56Z' },
      }),
    ]);
    expect(JSON.parse(bytes).annotations[0].generation.generated_at).toBe('2026-06-20T12:34:56Z');
  });

  it('normalizes summary whitespace and Unicode deterministically', () => {
    expect(normalizeSummary(' Café  toolkit\r\nfor\tdevelopers. ')).toBe(
      'Café toolkit for developers.',
    );
  });
});

describe('SEC-A: canonical summary rejects deceptive format characters', () => {
  // >= SUMMARY_MIN_LENGTH (80), already normalized, no control/format chars.
  const baseline =
    'A deterministic command-line toolkit that helps developers ship reproducible builds every day.';

  it('accepts a clean, normalized baseline summary', () => {
    expect(baseline.length).toBeGreaterThanOrEqual(80);
    expect(CanonicalSummarySchema.safeParse(baseline).success).toBe(true);
  });

  it.each([
    ['U+202E RLO (right-to-left override)', '‮'],
    ['U+200B ZWSP (zero-width space)', '​'],
    ['U+FEFF BOM (zero-width no-break)', '﻿'],
    ['U+0085 NEL (C1 control)', ''],
    ['U+2066 LRI (bidi isolate)', '⁦'],
    ['U+200E LRM', '‎'],
    ['U+2060 WORD JOINER', '⁠'],
    ['U+061C ARABIC LETTER MARK', '؜'],
  ])('rejects a summary containing %s', (_label, ch) => {
    const poisoned = baseline.replace('developers', `develop${ch}ers`);
    expect(CanonicalSummarySchema.safeParse(poisoned).success).toBe(false);
  });

  it('still accepts ZWNJ/ZWJ — legitimate in Arabic/Persian shaping and emoji', () => {
    for (const ch of ['‌', '‍']) {
      const withJoiner = baseline.replace('developers', `develop${ch}ers`);
      expect(CanonicalSummarySchema.safeParse(withJoiner).success).toBe(true);
    }
  });

  it('applies the same guard to the rendered model_label', () => {
    expect(OptionalModelLabelSchema.safeParse('claude-‮opus').success).toBe(false);
    expect(OptionalModelLabelSchema.safeParse('claude-opus-4').success).toBe(true);
    expect(OptionalModelLabelSchema.safeParse(null).success).toBe(true);
  });
});
