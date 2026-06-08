#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

resolve_pandoc_dir() {
  if [[ -n "${RSTUDIO_PANDOC:-}" ]]; then
    echo "${RSTUDIO_PANDOC}"
    return
  fi

  if command -v quarto >/dev/null 2>&1; then
    local quarto_bin
    quarto_bin="$(dirname "$(command -v quarto)")"
    if [[ -d "${quarto_bin}/tools" ]]; then
      echo "${quarto_bin}/tools"
      return
    fi
  fi

  if command -v pandoc >/dev/null 2>&1; then
    dirname "$(command -v pandoc)"
    return
  fi

  local rstudio_pandoc="/Applications/RStudio.app/Contents/Resources/app/quarto/bin/tools/aarch64"
  if [[ -d "${rstudio_pandoc}" ]]; then
    echo "${rstudio_pandoc}"
    return
  fi

  echo "Unable to locate pandoc. Set RSTUDIO_PANDOC or install Quarto/Pandoc." >&2
  return 1
}

resolve_quarto_cmd() {
  if command -v quarto >/dev/null 2>&1; then
    echo "quarto"
    return
  fi

  local app_quarto="/Applications/RStudio.app/Contents/Resources/app/quarto/bin/quarto"
  if [[ -x "${app_quarto}" ]]; then
    echo "${app_quarto}"
    return
  fi

  echo "Unable to locate quarto. Install Quarto or add it to PATH." >&2
  return 1
}

date_minus_one() {
  local base_date="$1"
  if date -j -v-1d -f "%F" "${base_date}" +%F >/dev/null 2>&1; then
    date -j -v-1d -f "%F" "${base_date}" +%F
  else
    date -d "${base_date} - 1 day" +%F
  fi
}

retry() {
  local max_attempts="$1"
  local delay_seconds="$2"
  shift 2

  local attempt=1
  until "$@"; do
    local exit_code=$?
    if (( attempt >= max_attempts )); then
      echo "Command failed after ${attempt} attempts: $*" >&2
      return "${exit_code}"
    fi
    echo "Attempt ${attempt} failed for: $*" >&2
    echo "Retrying in ${delay_seconds}s..." >&2
    sleep "${delay_seconds}"
    attempt=$((attempt + 1))
    delay_seconds=$((delay_seconds * 2))
  done
}

export RSTUDIO_PANDOC="$(resolve_pandoc_dir)"
quarto_cmd="$(resolve_quarto_cmd)"

today="${EVENT_DATE:-$(date +%F)}"
yesterday="$(date_minus_one "${today}")"
renv_bootstrap="renv::load(getwd());"

echo "Refreshing Diamond Signal for ${today}; training data through ${yesterday}"

Rscript -e "${renv_bootstrap} stopifnot(requireNamespace('rmarkdown', quietly = TRUE), requireNamespace('knitr', quietly = TRUE))"

retry 3 20 Rscript -e "${renv_bootstrap} rmarkdown::render('analysis/01_data_acquisition.Rmd', params = list(start_date = '2025-03-27', end_date = '${yesterday}', refresh_cache = FALSE), quiet = FALSE)"
retry 2 20 Rscript -e "${renv_bootstrap} rmarkdown::render('analysis/02_feature_engineering.Rmd', quiet = FALSE); rmarkdown::render('analysis/03_modeling_evaluation.Rmd', quiet = FALSE)"

Rscript -e "${renv_bootstrap} source('R/prepare_runtime.R')"
Rscript -e "${renv_bootstrap} source('R/export_site_data.R')"
export EVENT_DATE="${today}"
Rscript -e "${renv_bootstrap} source('R/run_model_projections.R')"
Rscript -e "${renv_bootstrap} source('R/run_daily_predictions.R')"
retry 3 20 Rscript -e "${renv_bootstrap} source('R/update_pick_results.R')"
Rscript -e "${renv_bootstrap} source('R/update_site_status.R')"

"${quarto_cmd}" render

git add .github/workflows/publish.yml .github/workflows/daily-refresh.yml R runtime site-data assets scripts _quarto.yml styles.css today.qmd picks.qmd performance.qmd data-health.qmd index.qmd results.qmd README.md

if git diff --cached --quiet; then
  echo "No daily changes to commit."
else
  git commit -m "Daily model refresh ${today}"
  git push origin main
fi
