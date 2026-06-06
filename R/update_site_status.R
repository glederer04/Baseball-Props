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
    line_feed_status = if (nrow(board)) "Live" else "Awaiting live lines",
    last_line_refresh = if (nrow(board) && "captured_at" %in% names(board)) {
      max(board$captured_at)
    } else {
      "Not available"
    },
    site_data_generated_at = format(Sys.time(), "%Y-%m-%d %H:%M %Z")
  )

write_csv(status, status_path)
