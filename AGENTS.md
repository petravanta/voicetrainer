# Notes for coding agents

Follow the shared standards in https://github.com/petravanta/general/blob/main/STANDARDS.md (hub link, theme switch, phone and desktop layouts, light and dark themes). This file only adds what's specific to VoiceTrainer.

- Source is in `src/`; `node build.js` inlines it into `dist/VoiceTrainer.html` (the hosted page) and `dist/artifact.html` (body content for a claude.ai Artifact). Never edit `dist/`.
- Run every test in `test/` before pushing; the Pages workflow runs them too and won't deploy if one fails.
- Canvas drawing reads the color tokens and redraws when `data-theme` changes; keep that working when adding new charts.
