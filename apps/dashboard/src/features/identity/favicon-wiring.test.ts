// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// M3-ID-4 / F-B / F-D — PARSER-based, not regex. index.html is parsed as HTML and
// favicon.svg as image/svg+xml, so single-quoted, double-quoted, and unquoted
// spellings all normalise to the same parsed attributes: quote style is no longer an
// escape surface (R3 boundary). The RESOLVED build output (`/starledger/favicon.svg`)
// is the build gate (M3-ID-5); the RENDERED favicon colour is the browser gate. These
// pin the parsed SOURCE contract — parsed semantics, not source spelling.
const appRoot = resolve(import.meta.dirname, '../../..');
const indexHtml = readFileSync(resolve(appRoot, 'index.html'), 'utf8');
const faviconSrc = readFileSync(resolve(appRoot, 'public/favicon.svg'), 'utf8');

describe('M3 identity — favicon wiring parsed from index.html (M3-ID-4, F-B)', () => {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  // An APPLIED favicon is an HTML <link> that is a DIRECT CHILD of <head>: a link
  // nested in <svg>/<body> (foreign / SVG-namespace) parses and preserves rel/href
  // but is never applied as a favicon. Scope to `head > link` in the HTML namespace,
  // NOT any `<link>` anywhere in the document (invariant i).
  const icons = [...doc.querySelectorAll('head > link[rel~="icon"]')].filter(
    (el) => el.namespaceURI === 'http://www.w3.org/1999/xhtml',
  );

  it('declares exactly one rel~="icon" HTML <link> as a direct child of <head>', () => {
    expect(icons).toHaveLength(1);
  });

  it('the link is an APPLIED SVG favicon: href %BASE_URL%favicon.svg, type image/svg+xml, no non-matching media', () => {
    const href = icons[0]?.getAttribute('href') ?? '';
    expect(href).toBe('%BASE_URL%favicon.svg');
    expect(href).not.toMatch(/^data:/i);
    expect(href).not.toMatch(/^[a-z][a-z0-9+.-]*:\/\//i); // scheme://host
    expect(href).not.toMatch(/^\/\//); // //host — protocol-relative
    // MIME must match the SVG asset — a wrong `type` (e.g. text/plain) can make the
    // browser reject the icon (invariant i).
    expect(icons[0]?.getAttribute('type')).toBe('image/svg+xml');
    // A never-matching `media` (e.g. "not all") parses but is never applied (i).
    expect(icons[0]?.getAttribute('media')).toBeNull();
  });
});

describe('M3 identity — favicon.svg parsed as SVG: exact grammar + F-1 static accent (F-D)', () => {
  const doc = new DOMParser().parseFromString(faviconSrc, 'image/svg+xml');
  const els = [...doc.querySelectorAll('*')];

  it('parses as valid SVG in the SVG namespace (no parser error; root <svg>; every element SVG-namespaced)', () => {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.tagName.toLowerCase()).toBe('svg');
    // A wrong `xmlns` (e.g. urn:not-svg) keeps the tag names/attrs but the descendants
    // are NOT SVG shapes — the favicon would not render as the Concept-B shape (iii).
    expect(doc.documentElement.namespaceURI).toBe(SVG_NS);
    for (const el of els) expect(el.namespaceURI).toBe(SVG_NS);
  });

  it('ships VISIBLE — no element suppresses the favicon via opacity/visibility/display, in ANY equivalent spelling (v)', () => {
    // Standalone asset (no CSS cascade; <style> banned) ⇒ presentation attributes are
    // the only channel. Compare SEMANTICALLY, not by exact string: opacity as a NUMBER
    // (0, 0.0, negative all suppress), visibility hidden|collapse, display none — all
    // trimmed + case-insensitive.
    for (const el of [doc.documentElement, ...els]) {
      for (const attr of ['opacity', 'fill-opacity', 'stroke-opacity']) {
        const v = el.getAttribute(attr);
        if (v !== null) expect(Number.parseFloat(v)).toBeGreaterThan(0);
      }
      const vis = el.getAttribute('visibility');
      if (vis !== null) expect(['hidden', 'collapse']).not.toContain(vis.trim().toLowerCase());
      const disp = el.getAttribute('display');
      // `none` and `contents` both leave an SVG leaf shape unpainted (contents = the
      // element generates no box); reject both, case-insensitive.
      if (disp !== null) expect(['none', 'contents']).not.toContain(disp.trim().toLowerCase());
    }
  });

  it('every favicon shape has EXACTLY its canonical parsed attribute map — no extra/degenerate/suppressing attr, any spelling (iii/iv/v)', () => {
    // The favicon is a FIXED asset: pin each shape's full parsed name→value map. This
    // closes ANY degenerate or suppressing attribute (display=contents, stroke="none"
    // on a stroke-only shape, an extra opacity, a drifted value, …) in ONE shot — no
    // denylist. Quote style and attribute order are parser-normalised; only the parsed
    // map is compared, so a source-spelling change still passes.
    const attrsOf = (el: Element) =>
      Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
    // Cover the ROOT <svg> (and forbid a wrapping nested <svg>): a suppression attr on
    // the root — even a CSS-escape-encoded one like visibility="\68idden" — is an EXTRA
    // attribute here and fails regardless of escape decoding; and exactly one <svg>.
    expect(doc.querySelectorAll('svg')).toHaveLength(1);
    expect(
      Object.fromEntries(
        [...doc.documentElement.attributes]
          .filter((a) => a.name !== 'xmlns')
          .map((a) => [a.name, a.value]),
      ),
    ).toEqual({ viewBox: '0 0 24 24', width: '32', height: '32' });
    // Parentage: the root's DIRECT children are exactly title + the shapes, and each of
    // those is a LEAF — a shape reparented into <title> (UA `display:none`) or nested in
    // <rect> (non-container) keeps the descendant counts + attr maps but is not painted.
    expect([...doc.documentElement.children].map((el) => el.tagName.toLowerCase())).toEqual([
      'title',
      'rect',
      'path',
      'line',
      'line',
      'line',
    ]);
    doc
      .querySelectorAll('title, rect, path, line')
      .forEach((el) => expect(el.children.length).toBe(0));
    expect(attrsOf(doc.querySelector('rect')!)).toEqual({
      x: '4',
      y: '2.75',
      width: '16',
      height: '18.5',
      rx: '2.5',
      fill: 'none',
      stroke: '#0969da',
      'stroke-width': '1.7',
    });
    expect(attrsOf(doc.querySelector('path')!)).toEqual({
      d: 'M8.7 5.8 L9.35 7.51 L11.17 7.6 L9.75 8.74 L10.23 10.5 L8.7 9.5 L7.17 10.5 L7.65 8.74 L6.23 7.6 L8.05 7.51 Z',
      fill: '#0969da',
    });
    expect([...doc.querySelectorAll('line')].map(attrsOf)).toEqual([
      {
        x1: '12.2',
        y1: '8.4',
        x2: '16.4',
        y2: '8.4',
        stroke: '#0969da',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
      },
      {
        x1: '7.6',
        y1: '13',
        x2: '16.4',
        y2: '13',
        stroke: '#0969da',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
      },
      {
        x1: '7.6',
        y1: '17.2',
        x2: '16.4',
        y2: '17.2',
        stroke: '#0969da',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
      },
    ]);
  });

  it('uses ONLY the fixed element vocabulary — no <style>/<filter>/<image>/<foreignObject>/<g>/etc.', () => {
    const ALLOWED = new Set(['svg', 'title', 'rect', 'path', 'line']);
    expect(els.length).toBeGreaterThan(0);
    for (const el of els) expect(ALLOWED.has(el.tagName.toLowerCase())).toBe(true);
  });

  it('every parsed fill/stroke is the single static `#0969da` or `none` — no inline style, any quote style', () => {
    const paints: string[] = [];
    for (const el of els) {
      expect(el.getAttribute('style')).toBeNull(); // no inline-style paint channel
      for (const attr of ['fill', 'stroke']) {
        const v = el.getAttribute(attr);
        if (v !== null) paints.push(v.trim().toLowerCase());
      }
    }
    expect(paints.length).toBeGreaterThan(0);
    for (const p of paints) expect(['#0969da', 'none']).toContain(p);
    expect(paints).toContain('#0969da'); // the F-1 static accent is actually used
  });

  it('is the canonical Concept-B geometry — parsed descriptor (quote/order irrelevant); a `d`/endpoint/stroke-width drift goes red', () => {
    expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 24 24');
    // Exact Concept-B shape multiset — a SECOND rect/path (even with a legal #0969da
    // paint) would leave the favicon no longer the single canonical shape (iii).
    expect(doc.querySelectorAll('rect')).toHaveLength(1);
    expect(doc.querySelectorAll('path')).toHaveLength(1);
    expect(doc.querySelectorAll('line')).toHaveLength(3);
    expect(doc.querySelectorAll('title')).toHaveLength(1);
    const rect = doc.querySelector('rect')!;
    expect([
      rect.getAttribute('x'),
      rect.getAttribute('y'),
      rect.getAttribute('width'),
      rect.getAttribute('height'),
      rect.getAttribute('rx'),
      rect.getAttribute('stroke-width'),
    ]).toEqual(['4', '2.75', '16', '18.5', '2.5', '1.7']);
    expect(rect.getAttribute('ry')).toBeNull(); // canonical: no ry (defaults to rx)
    expect(doc.querySelector('path')?.getAttribute('d')).toBe(
      'M8.7 5.8 L9.35 7.51 L11.17 7.6 L9.75 8.74 L10.23 10.5 L8.7 9.5 L7.17 10.5 L7.65 8.74 L6.23 7.6 L8.05 7.51 Z',
    );
    expect(
      [...doc.querySelectorAll('line')].map((l) => [
        l.getAttribute('x1'),
        l.getAttribute('y1'),
        l.getAttribute('x2'),
        l.getAttribute('y2'),
        l.getAttribute('stroke-width'),
      ]),
    ).toEqual([
      ['12.2', '8.4', '16.4', '8.4', '1.6'],
      ['7.6', '13', '16.4', '13', '1.6'],
      ['7.6', '17.2', '16.4', '17.2', '1.6'],
    ]);
  });
});
