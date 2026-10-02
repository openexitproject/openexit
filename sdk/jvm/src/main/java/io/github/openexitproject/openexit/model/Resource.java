package io.github.openexitproject.openexit.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/** Resource descriptor; schema and metadata values stay generic JSON. */
public record Resource(String name, JsonNode schema, String schemaId, String schemaVersion,
                       List<String> identity, long recordCount, List<ResourceChunk> chunks,
                       Boolean ordered, JsonNode metadata, String capturedAt, String snapshotToken) {
    public Resource { identity = identity == null ? null : List.copyOf(identity); chunks = chunks == null ? null : List.copyOf(chunks); }
}
