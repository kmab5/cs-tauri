# stories/

The inbox for `npm run cs:export`. Drop a `.cszip` here and build a standalone
app from it:

```bash
npm run cs:export -- --game sordwin.cszip --out dist-apps/sordwin --portable --nsis
```

`--game` resolves bare names against this folder, so `--game sordwin.cszip` and
`--game stories/sordwin.cszip` are the same thing.

Archives here are gitignored. They are games — usually someone's commercial
game — and they belong on your machine, not in the repository.
