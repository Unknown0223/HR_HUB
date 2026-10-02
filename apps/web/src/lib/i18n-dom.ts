/**
 * Uzbek mode for pages whose JSX still carries Russian literals: rendered text nodes and a few
 * attributes are swapped through the full dictionary and restored when Russian is chosen again.
 * Only nodeValue/attributes are written, never the DOM structure, so React reconciliation is unaffected.
 */

export type UzDictionary = {
  exact: Record<string, string>;
  /** Russian template with `{0}`/`{name}` slots → Uzbek template with the same slots. */
  patterns: Array<[string, string]>;
};

const CYR = /[А-Яа-яЁё]/;
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'PRE']);

const word = (stem: string) => new RegExp(`(?<![а-яё])${stem}(?![а-яё])`, 'gi');
const MONTHS: Array<[RegExp, string]> = [
  [word('январ[ья]'), 'yanvar'],
  [word('феврал[ья]'), 'fevral'],
  [word('марта?'), 'mart'],
  [word('апрел[ья]'), 'aprel'],
  [word('ма[йя]'), 'may'],
  [word('июн[ья]'), 'iyun'],
  [word('июл[ья]'), 'iyul'],
  [word('августа?'), 'avgust'],
  [word('сентябр[ья]'), 'sentabr'],
  [word('октябр[ья]'), 'oktabr'],
  [word('ноябр[ья]'), 'noyabr'],
  [word('декабр[ья]'), 'dekabr'],
  [word('янв\\.?'), 'yan'],
  [word('февр?\\.?'), 'fev'],
  [word('мар\\.?'), 'mar'],
  [word('апр\\.?'), 'apr'],
  [word('авг\\.?'), 'avg'],
  [word('сент?\\.?'), 'sen'],
  [word('окт\\.?'), 'okt'],
  [word('нояб?\\.?'), 'noy'],
  [word('дек\\.?'), 'dek'],
  [word('пн'), 'du'],
  [word('вт'), 'se'],
  [word('ср'), 'ch'],
  [word('чт'), 'pa'],
  [word('пт'), 'ju'],
  [word('сб'), 'sh'],
  [word('вс'), 'ya'],
];

const keepCase = (src: string, uz: string) =>
  src[0] === src[0].toUpperCase() ? uz[0].toUpperCase() + uz.slice(1) : uz;

type Compiled = { re: RegExp; slots: string[]; uz: string };

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile(dict: UzDictionary) {
  const byAnchor = new Map<string, Compiled[]>();
  for (const [ru, uz] of dict.patterns) {
    const parts = ru.split(/(\{[\w.]+\})/);
    const slots: string[] = [];
    let src = '^';
    for (const part of parts) {
      if (/^\{[\w.]+\}$/.test(part)) {
        slots.push(part);
        src += '(.+?)';
      } else {
        src += escapeRe(part).replace(/ /g, '\\s+');
      }
    }
    src += '$';
    const words = parts
      .filter((p) => !/^\{[\w.]+\}$/.test(p))
      .join(' ')
      .toLowerCase()
      .match(/[а-яё]+/g);
    if (!words || !slots.length) continue;
    const anchor = words.reduce((a, b) => (b.length > a.length ? b : a));
    const list = byAnchor.get(anchor) ?? [];
    list.push({ re: new RegExp(src, 's'), slots, uz });
    byAnchor.set(anchor, list);
  }
  return byAnchor;
}

function createTranslator(dict: UzDictionary) {
  const exact = dict.exact;
  const byAnchor = compile(dict);
  const cache = new Map<string, string>();

  function translateDates(s: string) {
    if (!/\d/.test(s)) return s;
    let out = s;
    for (const [re, uz] of MONTHS) out = out.replace(re, (m) => keepCase(m, uz));
    return out.replace(/(\d{4})\s*г\.?/g, '$1-y.');
  }

  function translateCore(core: string, depth = 0): string {
    const hit = exact[core];
    if (hit !== undefined) return hit;
    const words = core.toLowerCase().match(/[а-яё]+/g);
    if (words && depth < 2) {
      const seen = new Set<Compiled>();
      for (const w of words) {
        for (const c of byAnchor.get(w) ?? []) {
          if (seen.has(c)) continue;
          seen.add(c);
          const m = c.re.exec(core);
          if (!m) continue;
          let out = c.uz;
          c.slots.forEach((slot, i) => {
            const value = m[i + 1];
            out = out.replace(slot, CYR.test(value) ? translateCore(value.trim(), depth + 1) : value);
          });
          return out;
        }
      }
    }
    return translateDates(core);
  }

  return (value: string) => {
    const cached = cache.get(value);
    if (cached !== undefined) return cached;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(value)!;
    const core = m[2].replace(/\s+/g, ' ');
    const out = CYR.test(core) ? m[1] + translateCore(core) + m[3] : value;
    if (cache.size > 20000) cache.clear();
    cache.set(value, out);
    return out;
  };
}

function skipped(el: Element | null) {
  for (let e = el; e; e = e.parentElement) {
    if (
      SKIP_TAGS.has(e.tagName) ||
      e.hasAttribute('data-no-translate') ||
      (e as HTMLElement).isContentEditable
    ) {
      return true;
    }
  }
  return false;
}

export function startDomTranslation(dict: UzDictionary, root: HTMLElement = document.body) {
  const tr = createTranslator(dict);
  const texts = new Map<Text, { ru: string; uz: string }>();
  const attrs = new Map<Element, Record<string, { ru: string; uz: string }>>();

  function doText(node: Text) {
    const v = node.nodeValue;
    if (!v || !CYR.test(v)) return;
    const rec = texts.get(node);
    if (rec && rec.uz === v) return;
    if (skipped(node.parentElement)) return;
    const uz = tr(v);
    if (uz === v) return;
    texts.set(node, { ru: v, uz });
    node.nodeValue = uz;
  }

  function doAttr(el: Element, name: string) {
    const v = el.getAttribute(name);
    if (!v || !CYR.test(v)) return;
    const recs = attrs.get(el) ?? {};
    if (recs[name]?.uz === v) return;
    const uz = tr(v);
    if (uz === v) return;
    recs[name] = { ru: v, uz };
    attrs.set(el, recs);
    el.setAttribute(name, uz);
  }

  function doTree(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      doText(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (skipped(el)) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.nodeType === Node.ELEMENT_NODE && SKIP_TAGS.has((n as Element).tagName)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
      else for (const a of ATTRS) if ((n as Element).hasAttribute(a)) doAttr(n as Element, a);
    }
  }

  function prune() {
    if (texts.size < 8000) return;
    for (const n of texts.keys()) if (!n.isConnected) texts.delete(n);
    for (const e of attrs.keys()) if (!e.isConnected) attrs.delete(e);
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') doText(r.target as Text);
      else if (r.type === 'attributes' && r.attributeName) doAttr(r.target as Element, r.attributeName);
      else r.addedNodes.forEach(doTree);
    }
    prune();
  });

  doTree(root);
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });

  return () => {
    observer.disconnect();
    for (const [node, rec] of texts) if (node.nodeValue === rec.uz) node.nodeValue = rec.ru;
    for (const [el, recs] of attrs) {
      for (const [name, rec] of Object.entries(recs)) {
        if (el.getAttribute(name) === rec.uz) el.setAttribute(name, rec.ru);
      }
    }
    texts.clear();
    attrs.clear();
  };
}
