# Diamond Signal

An evidence-first MLB prop research dashboard built with R and Quarto.

## Current Product Scope

- Pitcher strikeout, batter total bases, and NRFI probability models
- Live FanDuel line ingestion through The Odds API
- Ranked model-versus-market signals with no-vig probability comparisons
- Browser-local pick slip and parlay odds tracker with public-result grading
- Chronological model evaluation and visible data-health reporting

## Development

The public website renders only the small, tracked files in `site-data/`.
Research artifacts remain local under `data/processed/`; compact objects needed
for live scoring are stored in `runtime/`.

```sh
Rscript R/export_site_data.R
Rscript R/prepare_runtime.R
Rscript R/run_daily_predictions.R
Rscript R/update_pick_results.R
quarto render
```

Set `ODDS_API_KEY` locally or as a GitHub Actions secret to activate live
pricing. Without it, the site renders an honest empty board rather than sample
or invented picks.

The site now uses two GitHub Actions workflows:

- `Daily Refresh` runs the full historical refresh, feature rebuild, model
  retrain/evaluation, runtime/site-data export, pick-result settlement refresh,
  and commits generated changes back to `main`.
- `Publish Site` deploys the already-committed site whenever `main` changes, and
  can also be run manually to rebuild the published site from current tracked
  data.

Store `ODDS_API_KEY` in GitHub Secrets so the scheduled refresh can populate the
live board. Without it, the automation will still publish an honest model-only
board with saved-pick settlement updates.

## Modeling Workflow

Research and model development live in [`analysis/`](analysis/README.md).
The ordered notebooks acquire outcomes, build leakage-safe pregame features,
evaluate candidates chronologically, and score captured lines.

## Publishing

The GitHub Actions workflow renders the Quarto website and publishes it through GitHub Pages after changes are pushed to `main`. API keys and other credentials must be stored in GitHub Secrets, never committed to this public repository.
