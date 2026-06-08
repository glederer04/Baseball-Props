suppressPackageStartupMessages({
  library(dplyr)
  library(readr)
})

status_path <- file.path("site-data", "pipeline_status.csv")
board_path <- file.path("site-data", "latest_board.csv")
status <- read_csv(status_path, show_col_types = FALSE)
board <- read_csv(board_path, show_col_types = FALSE)

status <- status |>
  mutate(
    sportsbook_name = "FanDuel",
    line_feed_status = if (nrow(board)) "FanDuel prices captured" else "No FanDuel prices available",
    priced_edge_count = nrow(board),
    last_line_refresh = if (nrow(board) && "captured_at" %in% names(board)) {
      max(board$captured_at)
    } else {
      "Not available"
    },
    site_data_generated_at = format(Sys.time(), "%B %e, %Y at %I:%M %p ET", tz = "America/New_York")
  )

write_csv(status, status_path)
