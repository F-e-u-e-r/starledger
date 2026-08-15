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
        "skills post-publish guard moved OUTSIDE the rollback region",
        "packages/deploy/src/stage.ts",
        "        hooks.afterCommit?.();\n"
        "        const publishedSha = createHash('sha256').update(readFileSync(distArtifact)).digest('hex');\n"
        "        if (publishedSha !== meta.classification_sha256) {\n"
        "          throw new Error('published skills-classification does not match the verified digest');\n"
        "        }\n\n        committed = true;",
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
]

if __name__ == "__main__":
    if not CASES:
        print("No CASES defined — edit this file, or import check() from your own script.")
        raise SystemExit(0)
    raise SystemExit(1 if check(CASES) else 0)
