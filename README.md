# Baseball Props

Personal MLB prediction research dashboard built with R and Quarto.

## Initial Product Scope

- Pitcher strikeout, batter total bases, and NRFI modeling
- Daily sportsbook price snapshots
- Ranked recommendations based on modeled probability differences
- Honest historical recommendation and calibration reporting

## Development

Open `Baseball-Props.Rproj` in RStudio and render the Quarto website locally.

```r
quarto::quarto_render()
```

The R package environment is managed with `renv`. Restore dependencies after cloning with:

```r
renv::restore()
```

## Modeling Workflow

Research and model development live in [`analysis/`](analysis/README.md) as
ordered R Markdown notebooks. The workflow acquires MLB game outcomes, builds
pregame rolling and weather/venue features, evaluates benchmark models
chronologically, and scores captured FanDuel lines once an `ODDS_API_KEY` is
configured locally.

## Publishing

The GitHub Actions workflow renders the Quarto website and publishes it through GitHub Pages after changes are pushed to `main`. API keys and other credentials must be stored in GitHub Secrets, never committed to this public repository.
