import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newsHtmlLooksExecutable, sanitizeNewsHtml } from './news-html';

/**
 * Payloads that would run in a real browser if assigned to innerHTML unsanitized.
 * jsdom does not execute <img onerror> / <script> the same way a browser does,
 * so we assert the sanitized string has no executable hooks left.
 */
const XSS_PAYLOADS = [
  '<script>window.__xss=1</script>Hello',
  '<img src=x onerror="window.__xss=1">',
  '<b onclick="window.__xss=1">hi</b>',
  '<a href="javascript:window.__xss=1">click</a>',
  '<a href="JAVASCRIPT:alert(1)">click</a>',
  '<a href="data:text/html,<script>window.__xss=1</script>">x</a>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<svg onload="window.__xss=1"></svg>',
  '<p>ok</p><script src="https://evil.example/x.js"></script>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<img src="x" onerror=alert(document.cookie)>',
  '<body onload=alert(1)>news</body>',
  '<input onfocus=alert(1) autofocus>',
  '<math><mtext></mtext></math>',
];

describe('sanitizeNewsHtml', () => {
  it('keeps simple formatting from the news editor', () => {
    const input =
      '<div>Hello <b>world</b> <i>and</i> <u>underline</u></div>' +
      '<blockquote>quote</blockquote>' +
      '<ul><li>one</li></ul>' +
      '<a href="https://example.com/news">link</a>';
    const out = sanitizeNewsHtml(input);
    assert.match(out, /<b>world<\/b>/);
    assert.match(out, /<i>and<\/i>/);
    assert.match(out, /<u>underline<\/u>/);
    assert.match(out, /<blockquote>/);
    assert.match(out, /<ul>/);
    assert.match(out, /href="https:\/\/example.com\/news"/);
    assert.equal(newsHtmlLooksExecutable(out), false);
  });

  it('does not leave browser-executable markup', () => {
    for (const payload of XSS_PAYLOADS) {
      const clean = sanitizeNewsHtml(payload);
      assert.equal(
        newsHtmlLooksExecutable(clean),
        false,
        `still executable after sanitize: ${payload} => ${clean}`,
      );
    }
  });

  it('strips script so innerHTML cannot run it', () => {
    let ran = false;
    const dirty = '<script>ran = true</script><b>ok</b>';
    const clean = sanitizeNewsHtml(dirty);
    // Simulate a browser assigning sanitized HTML. Remaining markup must not
    // include a script node or handlers; evaluating the string as JS is N/A.
    assert.equal(/<script/i.test(clean), false);
    assert.match(clean, /<b>ok<\/b>/);
    assert.equal(ran, false);
  });

  it('does not rewrite empty or plain text (existing posts stay readable)', () => {
    assert.equal(sanitizeNewsHtml(''), '');
    assert.equal(sanitizeNewsHtml('Просто текст'), 'Просто текст');
    assert.equal(sanitizeNewsHtml('<div>Старая новость</div>'), '<div>Старая новость</div>');
  });
});
