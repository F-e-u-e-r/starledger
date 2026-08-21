"""Mutation harness for auditing whether a regression actually discriminates.

A test that has never been shown able to FAIL is not a gate. This runs a named
mutation against a source file, re-runs a chosen test, and reports whether the
pin genuinely reddens — with a validity check, because three separate harness
defects during this project all failed in the direction of REPORTING SUCCESS.

Usage (from the repo root):

    python3 scripts/mutation-check.py

and edit CASES below, or import `check()` from your own script. Each case is
(label, source file, exact text to replace, replacement, test file, -t filter).
The source file is restored afterwards, including on failure.

VALIDITY CHECK, and why each part exists:

  1. a `-t` filter matching zero tests exits 0 — a completely unpinned fix was
     once reported as proven, so require a parsed test count > 0;
  2. vitest summarises on STDERR, so a parser reading stdout alone reports
     "0 tests ran" for every run;
  3. the summary carries ANSI escapes between "Tests" and the counts, and OMITS
     the "passed" clause entirely when every selected test fails;
  4. the trailing "(N)" total INCLUDES SKIPPED tests — a filter matching nothing
     reports "8 skipped (8)", which a total-only parser reads as "8 ran". Count
     only passed+failed;
  5. the BASELINE must be green and must have run tests, or "red" means nothing;
  6. the mutant must run the SAME number of tests as the baseline — a mutant
     that reddens by collecting fewer tests is measuring the wrong thing;
  7. the mutant must fail on an ASSERTION, not a syntax/type/setup error: a
     killed mutant with the wrong failure reason is not evidence.

And the lesson no harness can enforce: a mutation is evidence only when the
mutant genuinely reproduces the defect you mean. A mutant that fails to compile,
or that assigns to a `const`, reddens for its own reasons and proves nothing.
"""
import re, shutil, subprocess, sys

ANSI = re.compile(r"\x1b\[[0-9;]*m")

def run(testfile, name):
    cmd = ["npx", "vitest", "run", testfile] + (["-t", name] if name else [])
    r = subprocess.run(cmd, capture_output=True, text=True)
    # BOTH streams (vitest summarises on stderr) AND ANSI-stripped: the
    # summary line carries escape codes between "Tests" and the counts, which
    # silently defeats a naive regex and reports "0 tests ran" forever.
    out = ANSI.sub("", r.stdout + r.stderr)
    # Take the TOTAL from the trailing "(N)" — vitest omits the "passed"
    # clause entirely when every selected test fails, which a regex demanding
    # "passed" reads as "0 tests ran" and then calls the whole run invalid.
    line = re.search(r"^\s*Tests\s+(.*)$", out, re.M)
    ran = 0
    if line:
        # passed + failed ONLY. "skipped" must never count as executed.
        for n, word in re.findall(r"(\d+)\s+(passed|failed)", line.group(1)):
            ran += int(n)
    # An assertion failure is the only acceptable reason for a red mutant.
    assertion_failure = bool(re.search(r"AssertionError|expected .* to ", out))
    collect_error = bool(re.search(r"Error: (Transform failed|Failed to load)|SyntaxError|"
                                   r"TypeError: Assignment to constant", out))
    return r.returncode != 0, ran, assertion_failure, collect_error

def check(cases):
    bad = []
    for label, src, find, repl, testfile, name in cases:
        bak = f"/tmp/mut_{abs(hash(label))}.orig"
        shutil.copyfile(src, bak)
        original = open(src).read()
        if find not in original:
            print(f"!! ANCHOR MISSING   {label}"); bad.append(label); shutil.copyfile(bak, src); continue
        # Baseline: the pin must be GREEN before the mutation, or "red" means nothing.
        base_red, base_ran, _, base_collect = run(testfile, name)
        try:
            open(src, "w").write(original.replace(find, repl, 1))
            red, ran, assertion_failure, collect_error = run(testfile, name)
        finally:
            # RESTORE unconditionally: without this an interruption leaves the
            # source mutated, which is worse than any wrong verdict.
            shutil.copyfile(bak, src)
        ok = (
            (not base_red) and base_ran > 0 and not base_collect
            and red and ran == base_ran
            and assertion_failure and not collect_error
        )
        print(f"{'RED  ' if red else 'GREEN'}  ran={ran:<3} base={base_ran:<3} "
              f"assert={'Y' if assertion_failure else 'N'}  {label}")
        if not ok:
            reason = ("baseline not green" if base_red else
                      "baseline ran 0 tests" if base_ran == 0 else
                      "baseline failed to collect" if base_collect else
                      "mutant did not redden" if not red else
                      f"mutant ran {ran} tests, baseline ran {base_ran}" if ran != base_ran else
                      "mutant failed to compile/collect — wrong reason" if collect_error else
                      "mutant reddened without an assertion failure — wrong reason")
            print(f"      ^^ INVALID: {reason}")
            bad.append(label)
    return bad


# The LOAD-BEARING mutants for PR #245. An empty list made this script exit 0
# without running anything, so the "mutation-proven" claims in the spec were not
# reproducible from the tree (review finding). Running this file re-derives them.
CASES = [
    (
        "runtime integrity digests decoded text instead of bytes",
        "apps/dashboard/src/data/integrity.ts",
        "  if ((await sha256HexOfBytes(bytes)) !== expectedSha256) return null;",
        "  const t = new TextDecoder().decode(bytes);\n"
        "  if ((await sha256HexOfBytes(new TextEncoder().encode(t))) !== expectedSha256) return null;",
        "apps/dashboard/src/data/integrity-bytes.test.ts",
        "AGREE-BOM",
    ),
    (
        "runtime decoder swallows a leading BOM",
        "apps/dashboard/src/data/integrity.ts",
        "  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);",
        "  return new TextDecoder().decode(bytes);",
        "apps/dashboard/src/data/integrity-bytes.test.ts",
        "AGREE-BOM",
    ),
    (
        "canonical dataset invariants neutered in the shared primitive",
        "packages/schema/src/dataset-invariants.ts",
        "  const problems: string[] = [];",
        "  const problems: string[] = [];\n  return problems;",
        "apps/dashboard/src/data/canonical-invariants.test.ts",
        None,
    ),
    (
        "source presence probe treats any errno as absence",
        "packages/deploy/src/stage.ts",
        "        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;\n"
        "        throw error;\n      }\n    };\n    const hasArtifact",
        "        return false;\n      }\n    };\n    const hasArtifact",
        "packages/deploy/tests/skills-stage.test.ts",
        "SOURCE-ENOENT-ONLY",
    ),
    (
        "lock contention branch swallows every errno",
        "packages/deploy/src/stage.ts",
        "      if ((lockError as NodeJS.ErrnoException)?.code !== 'EEXIST') {",
        "      if (false) {",
        "packages/deploy/tests/skills-stage.test.ts",
        "LOCK-EEXIST-ONLY",
    ),
    (
        # `committed = true` is hoisted BEFORE the guard section, so every
        # guard (artifact digest AND meta read-back) detects but no longer
        # rolls back — the R7 defect re-created on the current source shape.
        # `-t GUARD` matches both GUARD and GUARD-META, so ran == base == 2.
        "skills post-publish guard moved OUTSIDE the rollback region",
        "packages/deploy/src/stage.ts",
        "        hooks.afterCommit?.();\n"
        "        const publishedSha = createHash('sha256').update(readFileSync(distArtifact)).digest('hex');\n"
        "        if (publishedSha !== meta.classification_sha256) {\n"
        "          throw new Error('published skills-classification does not match the verified digest');\n"
        "        }",
        "        committed = true;\n"
        "        hooks.afterCommit?.();\n"
        "        const publishedSha = createHash('sha256').update(readFileSync(distArtifact)).digest('hex');\n"
        "        if (publishedSha !== meta.classification_sha256) {\n"
        "          throw new Error('published skills-classification does not match the verified digest');\n"
        "        }",
        "packages/deploy/tests/skills-stage.test.ts",
        "GUARD",
    ),
    (
        "canonical publisher re-opens the source instead of the validated buffer",
        "packages/deploy/src/stage.ts",
        "  writeFileSync(distStars, starsBytes);",
        "  writeFileSync(distStars, readFileSync(starsPath));",
        "packages/deploy/tests/stage.test.ts",
        "SNAPSHOT",
    ),
    # Round-9 (owner ruling A): every pair's post-publish guard must cover the
    # META half too. One delete-mutant per pair, plus the R7 defect class for
    # the skills pair — the guard moved OUTSIDE the protected region detects
    # but no longer rolls back, so only the CONSEQUENCE assertions catch it.
    (
        "AI meta read-back guard removed",
        "packages/deploy/src/stage.ts",
        "    if (!landedMeta.equals(metaBytes)) {\n"
        "      const discard = discardOutcome();\n"
        "      return {\n"
        "        staged: false,\n"
        "        reason: `AI meta published bytes do not match the validated snapshot${discard.suffix}`,\n"
        "        ...(discard.residue ? { residue: true } : {}),\n"
        "      };\n"
        "    }\n"
        "    if (createHash('sha256').update(landedAnn).digest('hex') !== meta.annotations_sha256) {",
        "    if (createHash('sha256').update(landedAnn).digest('hex') !== meta.annotations_sha256) {",
        "packages/deploy/tests/ai-stage.test.ts",
        "GUARD-META",
    ),
    (
        "discovery meta read-back guard removed",
        "packages/deploy/src/stage.ts",
        "    if (!landedMeta.equals(metaBytes)) {\n"
        "      const discard = discardOutcome();\n"
        "      return {\n"
        "        staged: false,\n"
        "        reason: `discovery meta published bytes do not match the validated snapshot${discard.suffix}`,\n"
        "        ...(discard.residue ? { residue: true } : {}),\n"
        "      };\n"
        "    }\n"
        "    if (createHash('sha256').update(landedCandidates).digest('hex') !== meta.dataset_sha) {",
        "    if (createHash('sha256').update(landedCandidates).digest('hex') !== meta.dataset_sha) {",
        "packages/deploy/tests/discovery-stage.test.ts",
        "GUARD-META",
    ),
    (
        "skills meta read-back guard removed",
        "packages/deploy/src/stage.ts",
        "        if (!readFileSync(distMeta).equals(metaBytes)) {\n"
        "          throw new Error(\n"
        "            'published skills-classification meta does not match the validated snapshot',\n"
        "          );\n"
        "        }\n\n        committed = true;",
        "        committed = true;",
        "packages/deploy/tests/skills-stage.test.ts",
        "GUARD-META",
    ),
    (
        "skills meta read-back guard moved OUTSIDE the rollback region",
        "packages/deploy/src/stage.ts",
        "        if (!readFileSync(distMeta).equals(metaBytes)) {\n"
        "          throw new Error(\n"
        "            'published skills-classification meta does not match the validated snapshot',\n"
        "          );\n"
        "        }\n\n        committed = true;",
        "        committed = true;\n"
        "        if (!readFileSync(distMeta).equals(metaBytes)) {\n"
        "          throw new Error(\n"
        "            'published skills-classification meta does not match the validated snapshot',\n"
        "          );\n"
        "        }",
        "packages/deploy/tests/skills-stage.test.ts",
        "GUARD-META",
    ),
    (
        "canonical meta read-back guard removed",
        "packages/deploy/src/stage.ts",
        "  if (!readFileSync(distMeta).equals(metaBytes)) {\n"
        "    // Meta carries no self-digest, so this is a read-back rather than a digest\n"
        "    // guard — weaker, and named as such: it catches a re-read regression on the\n"
        "    // meta half, which the stars digest guard cannot see. Compared against the\n"
        "    // SOURCE bytes, not a re-encoding, so a normalization can never hide here.\n"
        "    throw new Error(`published ${DATASET_META_FILE} does not match the validated bytes`);\n"
        "  }\n",
        "",
        "packages/deploy/tests/stage.test.ts",
        "GUARD-META",
    ),
    # Round-9 leg findings, each mutant being the OLD implementation:
    (
        # The faithful old arm needs BOTH halves of the roundtrip restored —
        # publish the re-encoding AND read back against the re-encoding. A
        # single-site mutant trips the read-back guard instead and dies for the
        # wrong reason, which rule F forbids counting as evidence.
        "canonical meta published as a re-encoding instead of source bytes",
        "packages/deploy/src/stage.ts",
        "  writeFileSync(resolve(distDir, DATASET_META_FILE), metaBytes);\n"
        "\n"
        "  // STRUCTURAL guard, not a test seam. Review showed that ANY injection point\n"
        "  // the implementation itself invokes can be defeated by re-reading the source\n"
        "  // just before it — including re-assigning the validated buffer, which also\n"
        "  // defeats a read-back comparing against that buffer. So compare what actually\n"
        "  // LANDED against the digest recorded in META, which no rewrite of the source\n"
        "  // can influence. \"Published == verified\" is now enforced, not asserted.\n"
        "  hooks.afterPublish?.();\n"
        "  const distMeta = resolve(distDir, DATASET_META_FILE);\n"
        "  if (!readFileSync(distMeta).equals(metaBytes)) {",
        "  writeFileSync(resolve(distDir, DATASET_META_FILE), Buffer.from(metaBytes.toString('utf8'), 'utf8'));\n"
        "\n"
        "  // STRUCTURAL guard, not a test seam. Review showed that ANY injection point\n"
        "  // the implementation itself invokes can be defeated by re-reading the source\n"
        "  // just before it — including re-assigning the validated buffer, which also\n"
        "  // defeats a read-back comparing against that buffer. So compare what actually\n"
        "  // LANDED against the digest recorded in META, which no rewrite of the source\n"
        "  // can influence. \"Published == verified\" is now enforced, not asserted.\n"
        "  hooks.afterPublish?.();\n"
        "  const distMeta = resolve(distDir, DATASET_META_FILE);\n"
        "  if (!readFileSync(distMeta).equals(Buffer.from(metaBytes.toString('utf8'), 'utf8'))) {",
        "packages/deploy/tests/stage.test.ts",
        "BYTES-META",
    ),
    (
        "freshness monitor decodes the live meta with BOM-stripping text()",
        "packages/deploy/src/freshness.ts",
        "  const liveSha = parseLiveStarsSha(Buffer.from(await res.arrayBuffer()).toString('utf8'));",
        "  const liveSha = parseLiveStarsSha(await res.text());",
        "packages/deploy/tests/freshness.test.ts",
        "BOM-PARITY",
    ),
    (
        "App default canonical loader wired to the wrong base",
        "apps/dashboard/src/app/App.tsx",
        "    const load = loader ?? (() => loadStars({ base: import.meta.env.BASE_URL }));",
        "    const load = loader ?? (() => loadStars({ base: '/wrong-base/' }));",
        "apps/dashboard/src/app/App.test.tsx",
        "DEFAULT-PATH",
    ),
    (
        # The proxy pin is green at birth; this mutant is its able-to-fail
        # proof — a body-level bypass read the static allowlist can never see.
        "a loader consults an undeclared option in its body",
        "apps/dashboard/src/data/load-stars.ts",
        "  const base = opts.base ?? '/';",
        "  const base = opts.base ?? '/';\n"
        "  void (opts as { skipIntegrity?: boolean }).skipIntegrity;",
        "apps/dashboard/src/data/integrity-surface.test.ts",
        "INTEG-NO-BYPASS",
    ),
    # Round-9 (owner ruling C): the decoded-text digest class at its fifth and
    # sixth surfaces. Each mutant IS the old implementation — hash the lossy
    # decoding re-encoded — so a RED here is the two-arm proof that the pin
    # discriminates old from new.
    (
        "classifier dataset acceptance hashes decoded text instead of bytes",
        "packages/classifier/src/dataset.ts",
        "  const datasetSha256 = sha256Bytes(starsBytes);",
        "  const datasetSha256 = sha256Bytes(Buffer.from(starsText, 'utf8'));",
        "packages/classifier/tests/dataset.test.ts",
        "BYTES:",
    ),
    (
        # With the canonical-form gate byte-strict, every input REACHING the
        # hash gate has bytes identical to its decoded text's re-encoding, so a
        # text-hashing mutant there is indistinguishable — the discriminating
        # gate is the FORM check itself. This mutant is the round-9 defect:
        # compare the decoded text instead of the bytes. `-t BYTES` runs both
        # the original-meta and the re-stamped pins (ran == base == 2).
        "classifier canonical-form check compares decoded text instead of bytes",
        "packages/classifier/src/assemble.ts",
        "  if (\n"
        "    !Buffer.from(annotationsBytes).equals(\n"
        "      Buffer.from(serializeAnnotations(annotations.annotations), 'utf8'),\n"
        "    )\n"
        "  ) {",
        "  if (annotationsText !== serializeAnnotations(annotations.annotations)) {",
        "packages/classifier/tests/assemble.test.ts",
        "BYTES",
    ),
    (
        "discovery verify hashes decoded text instead of bytes",
        "packages/discovery/src/cli.ts",
        "    const sha = createHash('sha256').update(candidatesBytes).digest('hex');",
        "    const sha = createHash('sha256').update(candidatesBytes.toString('utf8'), 'utf8').digest('hex');",
        "packages/discovery/tests/cli-verify.test.ts",
        "BYTES:",
    ),
    # Round-10 mutants — each the defeated or old behavior:
    (
        "AI source probe reads every errno as absence again",
        "packages/deploy/src/stage.ts",
        "      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;\n"
        "      throw error;\n    }\n  };\n  let hasAnn: boolean;",
        "      return false;\n    }\n  };\n  let hasAnn: boolean;",
        "packages/deploy/tests/ai-stage.test.ts",
        "PROBE-ENOENT-ONLY",
    ),
    (
        "discovery source probe reads every errno as absence again",
        "packages/deploy/src/stage.ts",
        "      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;\n"
        "      throw error;\n    }\n  };\n  let hasCandidates: boolean;",
        "      return false;\n    }\n  };\n  let hasCandidates: boolean;",
        "packages/deploy/tests/discovery-stage.test.ts",
        "PROBE-ENOENT-ONLY",
    ),
    (
        # sol's round-10 defeat of the success-only behavioral pin: a bypass
        # consulted ONLY on the integrity-failure branch. The recording proxy
        # now runs that branch too, so the probe lands in the record.
        "a loader consults a bypass only on its integrity-failure branch",
        "apps/dashboard/src/data/load-annotations.ts",
        "    if (annText === null) {\n"
        "      return null; // hash mismatch → fail-soft (no re-fetch; AI is optional)\n"
        "    }",
        "    if (annText === null) {\n"
        "      void (opts as { allowUnverified?: boolean }).allowUnverified;\n"
        "      return null; // hash mismatch → fail-soft (no re-fetch; AI is optional)\n"
        "    }",
        "apps/dashboard/src/data/integrity-surface.test.ts",
        "integrity-FAILURE",
    ),
    (
        "skills hook default loader wired to the wrong base",
        "apps/dashboard/src/data/use-skills-classification.ts",
        "      loaderRef.current ?? (() => loadSkillsClassification({ base: import.meta.env.BASE_URL }));",
        "      loaderRef.current ?? (() => loadSkillsClassification({ base: '/wrong-base/' }));",
        "apps/dashboard/src/data/use-skills-classification.test.tsx",
        "DEFAULT-PATH",
    ),
    # Round-11 mutants:
    (
        # luna@max round-11 PoC: a bypass probed via the prototype walk, which
        # the get/has traps never see — the getPrototypeOf trap records it.
        "a loader probes a bypass through the options prototype",
        "apps/dashboard/src/data/load-discovery.ts",
        "  const base = opts.base ?? '/';",
        "  const base = opts.base ?? '/';\n"
        "  void (Object.getPrototypeOf(opts) as { skipIntegrity?: boolean } | null)?.skipIntegrity;",
        "apps/dashboard/src/data/integrity-surface.test.ts",
        "INTEG-NO-BYPASS",
    ),
    (
        # sol's round-11 PoC shape: a SYMBOL-keyed option — invisible to any
        # string comparison — probed in a loader body. The proxy records
        # non-well-known symbol probes, so both proxy pins for stars redden.
        "a loader probes a symbol-keyed bypass option",
        "apps/dashboard/src/data/load-stars.ts",
        "  const base = opts.base ?? '/';",
        "  const base = opts.base ?? '/';\n"
        "  void (opts as Record<symbol, unknown>)[Symbol.for('allowUnverified')];",
        "apps/dashboard/src/data/integrity-surface.test.ts",
        "INTEG-NO-BYPASS",
    ),
    # Round-12 mutants:
    (
        # sol + luna@max: a swallowed success-path backup discard. Reverting to
        # the void discard drops the residue flag on a stale .staging-bak.
        "skills success-path backup discard swallowed",
        "packages/deploy/src/stage.ts",
        "      for (const [backup] of movedAside) if (!discardOk(backup)) cleanupResidue = true;",
        "      for (const [backup] of movedAside) void discardOk(backup);",
        "packages/deploy/tests/skills-stage.test.ts",
        "CLEANUP-RESIDUE-SUCCESS",
    ),
    (
        "skills abort-path temporary discard swallowed",
        "packages/deploy/src/stage.ts",
        "      for (const path of created) if (!discardOk(path)) cleanupResidue = true;",
        "      for (const path of created) void discardOk(path);",
        "packages/deploy/tests/skills-stage.test.ts",
        "CLEANUP-RESIDUE-ABORT",
    ),
    (
        # sol round-12 PoC shape: a bypass probed via a WELL-KNOWN symbol
        # (opts[Symbol.iterator]) — invisible to the round-11 proxy that
        # exempted them. The all-symbols proxy records it, so both stars proxy
        # pins redden.
        "a loader probes a well-known-symbol bypass",
        "apps/dashboard/src/data/load-stars.ts",
        "  const base = opts.base ?? '/';",
        "  const base = opts.base ?? '/';\n"
        "  void (opts as Record<symbol, unknown>)[Symbol.iterator];",
        "apps/dashboard/src/data/integrity-surface.test.ts",
        "INTEG-NO-BYPASS",
    ),
    (
        # sol + luna@max: the App default-path pin must exercise the optional
        # ARTIFACT urls, not just their metas. A wrong base on the AI artifact
        # fetch reddens DEFAULT-PATH now that the artifact request is asserted.
        "AI loader default drops the base on the artifact fetch",
        "apps/dashboard/src/data/load-annotations.ts",
        "    const annRes = await doFetch(`${base}ai-annotations.json?sha=${meta.annotations_sha256}`);",
        "    const annRes = await doFetch(`/ai-annotations.json?sha=${meta.annotations_sha256}`);",
        "apps/dashboard/src/app/App.test.tsx",
        "DEFAULT-PATH",
    ),
    (
        # Round-11 intent, re-expressed on the round-13 discardOutcome shape:
        # dropping the residue spread on the meta-guard return makes a STUCK
        # discard report no residue ⇒ STUCK-RESIDUE reddens.
        "AI residue flag dropped on a stuck discard",
        "packages/deploy/src/stage.ts",
        "        reason: `AI meta published bytes do not match the validated snapshot${discard.suffix}`,\n"
        "        ...(discard.residue ? { residue: true } : {}),",
        "        reason: `AI meta published bytes do not match the validated snapshot${discard.suffix}`,",
        "packages/deploy/tests/ai-stage.test.ts",
        "STUCK-RESIDUE",
    ),
    # Round-13 mutants:
    (
        "skills temp recorded only after a clean write (partial leaks)",
        "packages/deploy/src/stage.ts",
        "      const writeTempExclusive = (path: string, bytes: Buffer): void => {\n"
        "        try {\n"
        "          writeTemp(path, bytes, { flag: 'wx' });\n"
        "          created.push(path);\n"
        "        } catch (error) {\n"
        "          if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') created.push(path);\n"
        "          throw error;\n"
        "        }\n"
        "      };",
        "      const writeTempExclusive = (path: string, bytes: Buffer): void => {\n"
        "        writeTemp(path, bytes, { flag: 'wx' });\n"
        "        created.push(path);\n"
        "      };",
        "packages/deploy/tests/skills-stage.test.ts",
        "PARTIAL-TEMP",
    ),
    (
        "AI discard removes a fixed pair instead of only changed paths",
        "packages/deploy/src/stage.ts",
        "      const now = snapshot(path);\n"
        "      if (now === null) continue; // nothing readable of ours there now\n"
        "      if (pre !== null && now.equals(pre)) continue; // unchanged since snapshot \u21d2 not ours",
        "      const now = snapshot(path);\n"
        "      if (now === null) continue; // nothing readable of ours there now\n"
        "      void pre;",
        "packages/deploy/tests/ai-stage.test.ts",
        "ZERO-WRITE",
    ),
    (
        "surface extractor misses method-form options",
        "apps/dashboard/src/data/integrity-surface.test.ts",
        "([A-Za-z_$][\\w$]*))\\s*\\??\\s*[:(]/gm,",
        "([A-Za-z_$][\\w$]*))\\s*\\??\\s*:/gm,",
        "apps/dashboard/src/data/integrity-surface.test.ts",
        "method-form option",
    ),
    (
        "entry-point extractor ignores a second parameter",
        "apps/dashboard/src/data/integrity-surface.test.ts",
        "  if (params.includes(','))\n"
        "    throw new Error(`${fn} declares more than one parameter \u2014 a second is an un-vetted surface`);",
        "  void params;",
        "apps/dashboard/src/data/integrity-surface.test.ts",
        "SECOND parameter",
    ),
    (
        # sol round-12/13: the escalation must read EVERY layer. A predicate
        # that checks only the first reddens the position-1 and position-2
        # decision cases.
        "residue escalation predicate checks only the first result",
        "packages/deploy/src/stage.ts",
        "  return results.some((result) => result.residue === true);",
        "  return results[0]?.residue === true;",
        "packages/deploy/tests/residue-decision.test.ts",
        "position",
    ),
]

if __name__ == "__main__":
    if not CASES:
        print("No CASES defined — edit this file, or import check() from your own script.")
        raise SystemExit(0)
    raise SystemExit(1 if check(CASES) else 0)
