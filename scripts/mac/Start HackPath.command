#!/bin/bash
# Created by: Brennan Meyer with use of Claude Code 10/26/2026 Santa Clarita, CA
# brennanmmeyer@gmail.com
#
# Double-click to start HackPath on a Mac. Needs Python 3.11 or newer,
# and Docker Desktop for the practice labs.

cd "$(dirname "$0")" || exit 1

find_python() {
  for py in python3.14 python3.13 python3.12 python3.11 python3; do
    if command -v "$py" >/dev/null 2>&1 &&
       "$py" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
      echo "$py"; return 0
    fi
  done
  return 1
}

PY="$(find_python)"
if [ -z "$PY" ]; then
  echo "HackPath needs Python 3.11 or newer."
  echo "Get it free at https://www.python.org/downloads/macos/"
  echo "Install it, then double-click this file again."
  echo
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Note: the practice labs need Docker Desktop for Mac:"
  echo "https://www.docker.com/products/docker-desktop/"
  echo
fi

"$PY" hackpath.py
