package io.github.openexitproject.openexit.model;

import com.fasterxml.jackson.databind.JsonNode;

/** One ordered, independently checksummed resource chunk. */
public record ResourceChunk(long sequence, String path, long recordCount, long uncompressedBytes,
                            String sha256, JsonNode firstIdentity, JsonNode lastIdentity, String completedAt) { }
