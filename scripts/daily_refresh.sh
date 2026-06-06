#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/.."

export RSTUDIO_PANDOC="/Applications/RStudio.app/Contents/Resources/app/quarto/bin/tools/aarch64"

today="$(date +%F)"
yesterday="$(date -v-1d +%F)"

echo "Refreshing Diamond Signal for ${today}; training data through ${yesterday}"

R --vanilla -q -e "rmarkdown::render('analysis/01_data_acquisition.Rmd', params = list(start_date = '2025-03-27', end_date = '${yesterday}', refresh_cache = FALSE), quiet = FALSE)"
R --vanilla -q -e "rmarkdown::render('analysis/02_feature_engineering.Rmd', quiet = FALSE); rmarkdown::render('analysis/03_modeling_evaluation.Rmd', quiet = FALSE)"

Rscript R/prepare_runtime.R
Rscript R/export_site_data.R
EVENT_DATE="${today}" Rscript R/run_model_projections.R
Rscript R/run_daily_predictions.R
Rscript R/update_site_status.R

/Applications/RStudio.app/Contents/Resources/app/quarto/bin/quarto render

git add .github/workflows/publish.yml R runtime site-data assets scripts _quarto.yml styles.css today.qmd performance.qmd data-health.qmd index.qmd results.qmd README.md

if git diff --cached --quiet; then
  echo "No daily changes to commit."
else
  git commit -m "Daily model refresh ${today}"
  git push origin main
fi
