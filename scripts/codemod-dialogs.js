/**
 * Codemod: window.confirm / confirm / window.alert / alert
 * → await confirm / await alert from @/lib/dialogs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'apps', 'web', 'src');

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

function findMatchingParen(code, openIdx) {
  let depth = 0;
  for (let j = openIdx; j < code.length; j++) {
    const ch = code[j];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return j;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      // skip strings
      const q = ch;
      j++;
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === q) break;
        j++;
      }
    }
  }
  return -1;
}

function replaceDialogCalls(src, name) {
  // Match window.name( or bare name( where name is confirm|alert
  const re = new RegExp(`(?:window\\.)?\\b${name}\\s*\\(`, 'g');
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    // skip property .confirm( without window - rare
    // skip if already await
    const before = src.slice(Math.max(0, start - 12), start);
    if (/\bawait\s+$/.test(before)) continue;
    // skip import { confirm
    if (/import\s*\{[^}]*$/.test(src.slice(Math.max(0, start - 80), start))) continue;
    // skip from '@/lib/dialogs' re-export patterns
    if (fileIsDialogs) continue;

    const openParen = start + m[0].length - 1;
    const closeParen = findMatchingParen(src, openParen);
    if (closeParen < 0) continue;

    // detect if (!confirm(...)) 
    let replaceStart = start;
    let prefix = '';
    let suffix = '';

    // whitespace before
    let k = start - 1;
    while (k >= 0 && /\s/.test(src[k])) k--;

    if (src[k] === '!') {
      let k2 = k - 1;
      while (k2 >= 0 && /\s/.test(src[k2])) k2--;
      if (src[k2] === '(') {
        // if (! confirm ( ... ) ) → if ( !( await confirm ( ... ) ) )
        replaceStart = k; // from !
        prefix = `!(await ${name}`;
        // original ends with ) of confirm; if still has closing )
        suffix = ')';
        // content: from openParen of confirm through closeParen
        out += src.slice(last, replaceStart);
        out += prefix;
        out += src.slice(openParen, closeParen + 1);
        out += suffix;
        last = closeParen + 1;
        re.lastIndex = last;
        continue;
      }
    }

    // plain: confirm(...) → await confirm(...)
    out += src.slice(last, start);
    out += `await ${name}`;
    out += src.slice(openParen, closeParen + 1);
    last = closeParen + 1;
    re.lastIndex = last;
  }
  out += src.slice(last);
  return out;
}

let fileIsDialogs = false;

function ensureAsync(src) {
  const lines = src.split('\n');
  const mark = [];
  lines.forEach((line, idx) => {
    if (/await\s+(?:confirm|alert)\s*\(/.test(line)) mark.push(idx);
  });

  for (const li of mark) {
    for (let u = li; u >= Math.max(0, li - 50); u--) {
      const line = lines[u];
      if (/\basync\b/.test(line) && (/function\b/.test(line) || /=>/.test(line))) break;
      if (/^\s*(export\s+)?function\s+\w+/.test(line) && !/\basync\b/.test(line)) {
        lines[u] = line.replace(/^(\s*)(export\s+)?function\b/, '$1$2async function');
        break;
      }
      if (/=\s*async\b/.test(line)) break;
      // const x = ( ... ) =>
      if (/=\s*\([^)]*\)\s*=>/.test(line)) {
        lines[u] = line.replace(/=\s*\(/, '= async (');
        break;
      }
      if (/=\s*\(\)\s*=>/.test(line)) {
        lines[u] = line.replace(/=\s*\(\)/, '= async ()');
        break;
      }
      if (/onClick=\{\s*async\b/.test(line)) break;
      if (/onClick=\{\s*\(/.test(line)) {
        lines[u] = line.replace(/onClick=\{\s*/, 'onClick={async ');
        break;
      }
      // async handlers: async function inside already checked
      if (/^\s*(const|let)\s+\w+\s*=\s*function\b/.test(line) && !/async/.test(line)) {
        lines[u] = line.replace(/=\s*function\b/, '= async function');
        break;
      }
    }
  }
  return lines.join('\n');
}

function patchFile(file) {
  fileIsDialogs = /dialogs\.ts$/.test(file) || /DialogHost\.tsx$/.test(file);
  if (fileIsDialogs) return false;

  const src = fs.readFileSync(file, 'utf8');
  if (!/(?:window\.)?\bconfirm\s*\(/.test(src) && !/(?:window\.)?\balert\s*\(/.test(src)) {
    return false;
  }
  // Only true call sites - password `confirm:` fields don't match confirm\(

  let next = replaceDialogCalls(src, 'confirm');
  next = replaceDialogCalls(next, 'alert');
  next = ensureAsync(next);

  const usesConfirm = /\bawait\s+confirm\s*\(/.test(next);
  const usesAlert = /\bawait\s+alert\s*\(/.test(next);
  if (!usesConfirm && !usesAlert) return false;

  if (!next.includes("@/lib/dialogs")) {
    const parts = [];
    if (usesConfirm) parts.push('confirm');
    if (usesAlert) parts.push('alert');
    const imp = `import { ${parts.join(', ')} } from '@/lib/dialogs';\n`;
    if (/^['"]use client['"];\r?\n/.test(next)) {
      next = next.replace(/(['"]use client['"];\r?\n)/, `$1${imp}`);
    } else {
      next = imp + next;
    }
  }

  if (next === src) return false;
  fs.writeFileSync(file, next);
  return true;
}

let n = 0;
for (const f of walk(ROOT)) {
  try {
    if (patchFile(f)) {
      n++;
      console.log('patched', path.relative(ROOT, f));
    }
  } catch (e) {
    console.error('ERR', f, e.message);
  }
}
console.log('total', n);
