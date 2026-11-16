/**
 * Split a text the way Pixi does before it draws character by character
 * (`CanvasTextMetrics.graphemeSegmenter`): into what a reader sees as one
 * character, where the browser can tell, into code points otherwise.
 *
 * Pixi adds letter spacing once per grapheme, both when it measures a text
 * (`CanvasTextMetrics._measureText`) and when it draws one
 * (`CanvasTextGenerator._drawLetterSpacing`), so anything that reproduces its
 * layout counts graphemes with this, not UTF-16 units or code points. An emoji
 * with a skin tone, or a family of joined emoji, is one grapheme.
 */
export function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter().segment(text)].map((part) => part.segment);
  }
  return [...text];
}

/**
 * For each code point of `text`, the index of the grapheme it belongs to (see
 * `graphemes`): how many letter spacings come before it on the canvas.
 */
export function graphemeIndexOfCodePoints(text: string): number[] {
  return graphemes(text).flatMap((piece, index) => [...piece].map(() => index));
}
