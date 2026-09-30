import { absoluteWebsiteUrl, htmlEscape, monthLabel, slugify, parishSlug } from '../../src/lib/format.js';

declare const externalValue: unknown;
const outputs: readonly string[] = [
  absoluteWebsiteUrl(externalValue),
  htmlEscape(externalValue),
  slugify(externalValue),
  parishSlug(externalValue),
  parishSlug('Holy Trinity', externalValue),
  monthLabel(11),
];
void outputs;
// @ts-expect-error: typed callers must supply a numeric month index.
monthLabel('11');
// @ts-expect-error: nullable indices must be handled by callers.
monthLabel(null);
// @ts-expect-error: formatting always returns text, never a numeric amount.
const amount: number = htmlEscape(42);
void amount;
