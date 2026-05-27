# Baseball Props

Personal MLB betting research dashboard built with R and Quarto.

## Initial Product Scope

- Pitcher strikeout and batter total bases modeling
- Daily sportsbook price snapshots
- Ranked recommendations based on modeled edge
- Honest historical results and performance reporting

## Development

Open `Baseball-Props.Rproj` in RStudio and render the Quarto website locally.

```r
quarto::quarto_render()
```

The R package environment is managed with `renv`. Restore dependencies after cloning with:

```r
renv::restore()
```

## Publishing

The GitHub Actions workflow renders the Quarto website and publishes it through GitHub Pages after changes are pushed to `main`. API keys and other credentials must be stored in GitHub Secrets, never committed to this public repository.

