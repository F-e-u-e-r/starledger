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
     the "passed" clause entirely when every selected test fails — so take the
     total from the trailing "(N)" on an ANSI-stripped line;
  4. the BASELINE must be green and must have run tests, or "red" means nothing.

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
    m = re.search(r"^\s*Tests\s+.*?\((\d+)\)\s*$", out, re.M)
    ran = int(m.group(1)) if m else 0
    return r.returncode != 0, ran

def check(cases):
    bad = []
    for label, src, find, repl, testfile, name in cases:
        bak = f"/tmp/mut_{abs(hash(label))}.orig"
        shutil.copyfile(src, bak)
        original = open(src).read()
        if find not in original:
            print(f"!! ANCHOR MISSING   {label}"); bad.append(label); shutil.copyfile(bak, src); continue
        # Baseline: the pin must be GREEN before the mutation, or "red" means nothing.
        base_red, base_ran = run(testfile, name)
        open(src, "w").write(original.replace(find, repl, 1))
        red, ran = run(testfile, name)
        shutil.copyfile(bak, src)
        ok = (not base_red) and base_ran > 0 and red and ran > 0
        print(f"{'RED  ' if red else 'GREEN'}  ran={ran:<3} base={'GREEN' if not base_red else 'RED'}({base_ran})  {label}")
        if not ok:
            reason = ("baseline not green" if base_red else
                      "baseline ran 0 tests" if base_ran == 0 else
                      "mutant did not redden" if not red else "mutant ran 0 tests")
            print(f"      ^^ INVALID: {reason}")
            bad.append(label)
    return bad


CASES = [
    # ("label", "src/file.ts", "exact text", "replacement", "tests/file.test.ts", "-t filter"),
]

if __name__ == "__main__":
    if not CASES:
        print("No CASES defined — edit this file, or import check() from your own script.")
        raise SystemExit(0)
    raise SystemExit(1 if check(CASES) else 0)
