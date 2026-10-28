# Field-guide type

Jamie explicitly requested custom fonts on 2026-10-28. Upright variable
fonts only; no external font service or browser asset request.

- `fraunces.woff2`: `googlefonts/fraunces` commit
  `ad58030f7daa4d12f14f4c059b7ed1205e28105c`,
  `fonts/web/Fraunces[SOFT,WONK,opsz,wght].woff2`; original bytes, OFL in
  `OFL-Fraunces.txt`. https://github.com/googlefonts/fraunces
- `source-sans-3.woff2`: `adobe-fonts/source-sans` commit
  `87b37a2daaed80fcb8e8ccb0085c4d72ddade12e`,
  `WOFF2/VF/SourceSans3VF-Upright.ttf.woff2`; original bytes, OFL in
  `OFL-SourceSans3.txt`. https://github.com/adobe-fonts/source-sans

Downloaded from the official repositories at those exact revisions and
verified against the Git blob hashes. No conversion or subsetting.
