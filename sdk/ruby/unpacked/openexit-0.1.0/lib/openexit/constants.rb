module OpenExit
  SCHEMA_NAMES = %w[manifest scope resource resource-chunk asset relationship checkpoint event inspection-result].freeze
  CONSISTENCY_LEVELS = %w[snapshot bounded best_effort].freeze
end
