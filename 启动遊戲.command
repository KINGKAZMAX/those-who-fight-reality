#!/bin/zsh
cd "${0:A:h}" || exit 1
python3 tools/serve_lf2.py --open
