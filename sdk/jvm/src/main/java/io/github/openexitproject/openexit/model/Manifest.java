package io.github.openexitproject.openexit.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/** PASP manifest fields with generic JSON retained for extensible protocol data. */
public record Manifest(String format, String paspVersion, String packageId, String exportId,
                       String createdAt, ProducerInfo producer, Scope scope, Consistency consistency,
                       List<ResourceReference> resources, AssetSummary assets, IntegrityInfo integrity,
                       String relationships, JsonNode document) {
    public Manifest { resources = resources == null ? null : List.copyOf(resources); document = document == null ? null : document.deepCopy(); }
}
