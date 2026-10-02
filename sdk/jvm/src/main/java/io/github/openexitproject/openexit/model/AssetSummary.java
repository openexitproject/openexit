package io.github.openexitproject.openexit.model;

/** Asset totals recorded by the PASP manifest. */
public record AssetSummary(long count, long totalBytes, String index) { }
