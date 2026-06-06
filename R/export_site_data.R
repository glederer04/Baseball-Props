library(dplyr)
library(readr)

processed_dir <- file.path("data", "processed")
site_dir <- "site-data"
dir.create(site_dir, recursive = TRUE, showWarnings = FALSE)

count <- read_csv(file.path(processed_dir, "count_metrics.csv"), show_col_types = FALSE)
prob <- read_csv(file.path(processed_dir, "probability_metrics.csv"), show_col_types = FALSE)
nrfi <- read_csv(file.path(processed_dir, "nrfi_metrics.csv"), show_col_types = FALSE)
registry <- read_csv(file.path(processed_dir, "selected_model_registry.csv"), show_col_types = FALSE)
game_context <- read_csv(file.path(processed_dir, "game_context.csv"), show_col_types = FALSE)

prop_summary <- registry |>
  filter(market != "nrfi") |>
  rename(selected_model = model) |>
  left_join(count, by = c("market", "selected_model" = "model")) |>
  left_join(prob, by = c("market", "selected_model" = "model")) |>
  transmute(
    market, selected_model, training_rows, test_rows, training_through,
    test_start, brier_score, log_loss, mae, rmse, auc = NA_real_
  )

nrfi_summary <- registry |>
  filter(market == "nrfi") |>
  rename(selected_model = model) |>
  left_join(nrfi, by = c("market", "selected_model" = "model")) |>
  transmute(
    market, selected_model, training_rows, test_rows, training_through,
    test_start, brier_score, log_loss, mae = NA_real_, rmse = NA_real_, auc
  )

write_csv(bind_rows(prop_summary, nrfi_summary), file.path(site_dir, "model_summary.csv"))

factors <- tribble(
  ~category, ~factor, ~plain_language, ~technical_detail,
  "Player form", "Recent production", "What has this player produced over the last 5 and 10 games?", "Trailing means are calculated strictly before the game being predicted.",
  "Player form", "Typical workload", "How much opportunity has the player recently received?", "Recent innings pitched or plate appearances help anchor the expected count.",
  "Matchup", "Opponent allowed form", "How much has this opponent recently allowed in the target market?", "Joined by opponent and market using prior games only.",
  "Environment", "Venue and weather", "Could the park and conditions change the run environment?", "Temperature, wind, roof, surface, elevation, and center-field distance are candidate context features.",
  "NRFI", "Starter quality", "How strong and durable are both probable starters?", "Both starters' trailing strikeout and workload form enter the NRFI model.",
  "NRFI", "Team and venue history", "How often have these clubs and this park produced scoreless first innings?", "Trailing team NRFI rates and a venue 20-game rate are calculated before each target game."
)
write_csv(factors, file.path(site_dir, "model_factors.csv"))

board_path <- file.path(site_dir, "latest_board.csv")
if (!file.exists(board_path)) {
  write_csv(
    tibble(
      selection = character(), matchup = character(), game_time = character(),
      market = character(), side = character(), line = double(),
      american_price = double(), model_probability = double(),
      implied_probability = double(), probability_difference = double(),
      signal = character()
    ),
    board_path
  )
}

board <- read_csv(board_path, show_col_types = FALSE)
line_status <- if (nrow(board)) "Live" else "Awaiting live lines"
last_refresh <- if (nrow(board) && "captured_at" %in% names(board)) {
  max(board$captured_at)
} else {
  "Not available"
}

status <- tibble(
  historical_data_through = as.character(max(as.Date(game_context$game_date))),
  model_training_through = as.character(max(as.Date(bind_rows(prop_summary, nrfi_summary)$training_through))),
  line_feed_status = line_status,
  last_line_refresh = last_refresh,
  site_data_generated_at = format(Sys.time(), "%Y-%m-%d %H:%M %Z")
)
write_csv(status, file.path(site_dir, "pipeline_status.csv"))
