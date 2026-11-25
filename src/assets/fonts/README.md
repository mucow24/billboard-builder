Put `.ttf`, `.otf`, `.woff`, or `.woff2` files in this folder.

When the app starts, it will automatically load every supported font file here
and add it to the editor font list.

The editor takes each font's family, weight and style from its file name, not
from the file itself: "Bold" makes it bold, "Italic" or "Oblique" makes it
italic, and "Regular", "Roman" and "Book" are dropped. Two files that come out
the same, such as `Example Book.otf` and `Example Regular.ttf`, cannot both be
used: text renders with the one whose file name sorts last.

"Bold" straight after "Semi", "Demi", "Extra" or "Ultra" is not bold but a
weight of its own, however the two are joined ("SemiBold", "Semi Bold",
"Semi-Bold"). Like every weight other than regular and bold, it gets its own
entry in the font list, with the weight written as one word:
`Example-SemiBold.ttf` and `Example-SemiBoldItalic.ttf` are the regular and
italic of "Example SemiBold", not bold faces of "Example Semi".
