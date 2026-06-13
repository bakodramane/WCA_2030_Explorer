/**
 * Cross-reference link helper for WCA 2030 Explorer.
 *
 * Scans already-HTML-escaped text (which may also contain <mark> highlight
 * tags) for "Item NNNN" references and wraps them in <a data-item-ref="NNNN">
 * anchors that the App can handle via delegated event listeners.
 *
 * Call setKnownItemCodes() once after the engine loads so only codes that
 * exist in items.json become links; unknown codes stay as plain text.
 */

let _knownCodes: ReadonlySet<string> = new Set();

export function setKnownItemCodes(codes: ReadonlySet<string>): void {
  _knownCodes = codes;
}

/**
 * Transform an HTML string (already escaped, possibly containing <mark> tags)
 * so that every "Item NNNN" reference whose code is in the known-codes set
 * becomes a clickable anchor.
 *
 * Parens are preserved outside the link when present: "(Item 0206)" becomes
 * "(<a ...>Item 0206</a>)".
 *
 * The regex handles <mark>Item</mark> and <mark>NNNN</mark> variants that
 * arise when term-highlighting runs before linkifying.
 */
export function linkifyItems(html: string): string {
  if (_knownCodes.size === 0) return html;

  // Each alternation handles whether <mark> tags wrap the word or the digits.
  //   Group 1: optional opening paren
  //   Group 2: "Item" part, possibly wrapped in <mark>…</mark>
  //   Group 3: 4-digit code part, possibly wrapped in <mark>…</mark>
  //   Group 4: optional closing paren
  const ITEM_RE = /(\()?(<mark>Item<\/mark>|Item)\s+(<mark>\d{4}<\/mark>|\d{4})(?!\d)(\))?/gi;

  return html.replace(ITEM_RE, (match, open, itemPart, codePart, close) => {
    const rawCode = codePart.replace(/<\/?mark>/g, '').trim();
    const code = rawCode.padStart(4, '0');
    if (!_knownCodes.has(code)) return match;

    const link = `<a class="item-ref-link" data-item-ref="${code}" href="#">${itemPart} ${codePart}</a>`;
    return (open ?? '') + link + (close ?? '');
  });
}
