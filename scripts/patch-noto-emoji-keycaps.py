"""Give Noto Emoji's keycap glyphs private code points of their own.

Noto Emoji draws a keycap (a digit, "#" or "*" followed by U+20E3) with a
ligature: the two characters together become one keycap glyph. The app keeps
Noto Emoji off ASCII characters (see EMOJI_FALLBACK_UNICODE_RANGE in
src/editor/fonts/emojiFallback.ts), so it can never reach the digit that starts
a keycap. Instead, the app swaps each keycap for one private-use character
before drawing (drawnText), and this script maps those characters straight to
the keycap glyphs in the font's cmap. Nothing else in the font changes.

The code points must match EMOJI_KEYCAP_CODE_POINTS in emojiFallback.ts:
U+F0000 + the base's index in KEYCAP_BASES. A unit test
(src/editor/fonts/emojiKeycapFont.test.ts) checks the bundled font against it.

Usage, with fontTools installed (pip install fonttools):

    python scripts/patch-noto-emoji-keycaps.py [INPUT] [OUTPUT]

INPUT defaults to src/assets/fonts/NotoEmoji-Regular.ttf and OUTPUT to INPUT.
Run it on a fresh copy of Noto Emoji (google/fonts ofl/notoemoji/
NotoEmoji[wght].ttf) whenever the bundled file is updated. Running it on an
already patched file changes nothing.
"""

import sys

from fontTools.ttLib import TTFont

KEYCAP_BASES = "0123456789#*"
FIRST_KEYCAP_CODE_POINT = 0xF0000
KEYCAP_MARK = 0x20E3


def keycap_glyphs(font):
    """The keycap glyph of each base, as the font's ligatures make them from base + U+20E3."""
    cmap = font.getBestCmap()
    mark = cmap[KEYCAP_MARK]
    base_of = {cmap[ord(base)]: base for base in KEYCAP_BASES}
    found = {}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for subtable in lookup.SubTable:
            if lookup.LookupType == 7:
                subtable = subtable.ExtSubTable
            for first, ligatures in getattr(subtable, "ligatures", {}).items():
                if first not in base_of:
                    continue
                for ligature in ligatures:
                    if list(ligature.Component) == [mark]:
                        found.setdefault(base_of[first], ligature.LigGlyph)
    missing = [base for base in KEYCAP_BASES if base not in found]
    if missing:
        sys.exit(f"No keycap ligature found for: {' '.join(missing)}")
    return found


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else "src/assets/fonts/NotoEmoji-Regular.ttf"
    target = sys.argv[2] if len(sys.argv) > 2 else source
    # The ligatures are read from a copy of their own, so that only the cmap of
    # the font that is saved is decompiled and written anew.
    glyphs = keycap_glyphs(TTFont(source))
    font = TTFont(source, recalcTimestamp=False)

    patched = 0
    for table in font["cmap"].tables:
        # Only the subtables that can hold code points past the BMP.
        if table.format not in (12, 13) or not table.isUnicode():
            continue
        for index, base in enumerate(KEYCAP_BASES):
            table.cmap[FIRST_KEYCAP_CODE_POINT + index] = glyphs[base]
        patched += 1
    if patched == 0:
        sys.exit("The font has no cmap subtable for code points past the BMP.")

    font.save(target)
    for index, base in enumerate(KEYCAP_BASES):
        print(f"U+{FIRST_KEYCAP_CODE_POINT + index:X} -> {glyphs[base]}")


if __name__ == "__main__":
    main()
