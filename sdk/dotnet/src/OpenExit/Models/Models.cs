using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace OpenExit;

public sealed record Scope([property: JsonPropertyName("type")] string Type, [property: JsonPropertyName("id")] string Id);
public sealed record ProducerInfo([property: JsonPropertyName("name")] string Name, [property: JsonPropertyName("version")] string Version);
public enum ConsistencyLevel { Snapshot, Bounded, BestEffort }
public sealed record Consistency([property: JsonPropertyName("level")] ConsistencyLevel Level, [property: JsonPropertyName("metadata")] JsonObject? Metadata = null);
public sealed record IntegrityInfo([property: JsonPropertyName("algorithm")] string Algorithm, [property: JsonPropertyName("checksums")] string? Checksums = null);
public sealed record ResourceChunk([property: JsonPropertyName("sequence")] int Sequence, [property: JsonPropertyName("path")] string Path, [property: JsonPropertyName("recordCount")] long RecordCount, [property: JsonPropertyName("uncompressedBytes")] long UncompressedBytes, [property: JsonPropertyName("sha256")] string Sha256);
public sealed record Resource([property: JsonPropertyName("name")] string Name, [property: JsonPropertyName("schema")] string Schema, [property: JsonPropertyName("identity")] JsonArray Identity, [property: JsonPropertyName("recordCount")] long RecordCount, [property: JsonPropertyName("chunks")] IReadOnlyList<ResourceChunk> Chunks);
public sealed record AssetSummary([property: JsonPropertyName("count")] long Count, [property: JsonPropertyName("totalBytes")] long TotalBytes);
public sealed record RelationshipEndpoint([property: JsonPropertyName("resource")] string Resource, [property: JsonPropertyName("pointer")] string Pointer);
public sealed record Relationship([property: JsonPropertyName("id")] string Id, [property: JsonPropertyName("from")] RelationshipEndpoint From, [property: JsonPropertyName("to")] RelationshipEndpoint To, [property: JsonPropertyName("cardinality")] string Cardinality);
public sealed record Manifest(string Format, string PaspVersion, string PackageId, string ExportId, DateTimeOffset CreatedAt, ProducerInfo Producer, Scope Scope, Consistency Consistency, IReadOnlyList<Resource> Resources, AssetSummary Assets, IntegrityInfo Integrity, JsonObject? Extensions = null);
public sealed record InspectionResult(bool Valid, string PaspVersion, string? PackageId, string? ExportId, Scope? Scope, Consistency? Consistency, ProducerInfo? Producer, IReadOnlyList<string> Resources, IReadOnlyDictionary<string, long> ResourceRecordCounts, int ResourceChunkCount, long AssetCount, long AssetTotalBytes, int RelationshipCount, IReadOnlyList<PaspException> Errors);
