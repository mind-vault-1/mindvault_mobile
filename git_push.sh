#!/bin/bash
git checkout -b feature/issue-16-mobile-signing-strategy
git add .
git commit -m "feat: add mobile signing strategy PoC"
git push origin feature/issue-16-mobile-signing-strategy
gh pr create --title "feat: mobile signing strategy PoC" --body "Implementation of issue #16."
