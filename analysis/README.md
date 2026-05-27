# Modeling Notebooks

These notebooks are the research pipeline behind the Baseball Props site. They
are intentionally separate from the Quarto interface until the ingestion,
evaluation, and pricing workflows are validated.

Run in order:

1. `01_data_acquisition.Rmd` downloads completed MLB box scores and constructs
   game-level pitcher strikeout, batter total-bases, and NRFI outcomes, with
   MLB-recorded game weather and stadium characteristics.
2. `02_feature_engineering.Rmd` builds only pregame rolling, venue, and
   weather features.
3. `03_modeling_evaluation.Rmd` compares baseline and context-enhanced count
   models, fits an NRFI probability model, and evaluates chronologically.
4. `04_daily_predictions.Rmd` retrieves FanDuel prop prices when
   `ODDS_API_KEY` is available, retrieves forecast weather from
   [Open-Meteo](https://open-meteo.com/en/docs), and scores possible
   recommendations including NRFI through first-inning totals.
5. `05_model_readiness.Rmd` states the calibration and forward-testing gates
   required before recommendations appear on the site.

The data pipeline uses the public MLB Stats API. Live player props use
[The Odds API](https://the-odds-api.com/sports-odds-data/betting-markets.html),
whose MLB market catalog includes `pitcher_strikeouts` and
`batter_total_bases`, while its game-period catalog includes
`totals_1st_1_innings` for evaluating NRFI (`Under 0.5`). Set `ODDS_API_KEY`
in a local `.Renviron`; it must never be committed.

The default acquisition range begins with the 2025 regular season and runs
through yesterday. A smaller acquisition render can be used while testing:

```r
rmarkdown::render(
  "analysis/01_data_acquisition.Rmd",
  params = list(start_date = "2025-04-01", end_date = "2025-05-31")
)
```

For meaningful validation, rerender the first notebook across at least one
full prior season before rendering the remaining notebooks. The notebooks
report probability calibration and tracked recommendation outcomes; they do
not require or report stake amounts.
