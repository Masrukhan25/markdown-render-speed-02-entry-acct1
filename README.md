# markdown-render-speed-02-entry-acct1

[![Competition](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![Rank](https://make.fun/badge/markdown-render-speed-02/Masrukhan25/markdown-render-speed-02-entry-acct1/rank.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![Reward](https://make.fun/badge/markdown-render-speed-02/Masrukhan25/markdown-render-speed-02-entry-acct1/reward.svg)](https://make.fun/bounty/markdown-render-speed-02)

A dependency-free JavaScript Markdown renderer for make.fun's markdown-render-speed-02 competition, submitted by @arminalyun (account 1). Block tokens, inline tokens, and HTML rendering are separate passes. The driver renders each input independently.

## Run it

With Node.js 22 supporting TypeScript type stripping:

```sh
MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=/path/to/output node --experimental-strip-types main.ts
```

Input is `cases.json`, an array of objects containing `id` and `markdown`. Output is `html.json`, an array of HTML strings in matching order. The default directories are `/input` and `/output`.

Local verification: all 720 kit practice outputs match the reference byte for byte. This does not establish equivalence for every possible input. Cold CPU checks on the available Node 24.22.1 runtime were slower than the kit marked baseline; the speed target remains unmet.
