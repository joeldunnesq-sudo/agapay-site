# Accounting PDF dependencies

PDF-LIB 1.17.1: https://github.com/Hopding/pdf-lib (MIT; LICENSE.md).
The ESM distribution is copied from the existing project dependency.

@pdf-lib/fontkit 1.1.1: https://github.com/Hopding/fontkit (MIT, as declared in the upstream package metadata and README included here).
The published ESM distribution is bundled with the project's pako dependency using esbuild (bundle, minify, ESM, browser target). Pako's license is included; the upstream package metadata and source README retain the authorship and licensing references.

Noto Sans Regular and Bold: https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans
The font files and SIL Open Font License are in ../accounting-fonts. Fonts are embedded as subsets in exported PDFs so accented, Greek, and Cyrillic parish names remain readable without external font requests.

The PDF runtime and fonts load only when Download PDF is used. Report data stays in the user's browser.
