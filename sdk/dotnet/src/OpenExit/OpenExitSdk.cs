using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text;
using Json.Schema;

namespace OpenExit;

/// <summary>Public PASP manifest and directory bundle facade.</summary>
public static class OpenExitSdk
{
    /// <summary>Parses JSON text without validating PASP semantics.</summary>
    public static JsonNode ParseManifestJson(string json) => Protocol.Parse(json);
    /// <summary>Parses a UTF-8 JSON stream without validating PASP semantics.</summary>
    public static JsonNode ParseManifest(Stream stream)
    {
        try { return JsonNode.Parse(stream) ?? throw new JsonException(); }
        catch (Exception ex) when (ex is JsonException or FormatException) { throw new PaspException("PASP_INVALID_MANIFEST", "Manifest JSON is invalid.", innerException: ex); }
    }
    /// <summary>Parses a manifest file without validating PASP semantics.</summary>
    public static JsonNode ParseManifestFile(string path) { ArgumentNullException.ThrowIfNull(path); using var s = File.OpenRead(path); return ParseManifest(s); }

    /// <summary>Validates and converts a manifest into native models.</summary>
    public static Manifest ValidateManifest(JsonNode manifest)
    {
        if (manifest is not JsonObject o) throw new PaspException("PASP_INVALID_MANIFEST", "Manifest must be an object.");
        var version = Protocol.RequiredString(o, "paspVersion");
        if (version != OpenExitInfo.PaspVersion) throw new PaspException("PASP_UNSUPPORTED_VERSION", $"Unsupported PASP version: {version}");
        try
        {
            if (!SchemaRegistry.Validate("manifest.schema.json", manifest)) throw new PaspException("PASP_INVALID_MANIFEST", "Manifest does not satisfy the canonical PASP schema.");
        }
        catch (PaspException) { throw; }
        catch (Exception ex) { throw new PaspException("PASP_INVALID_MANIFEST", "Manifest schema validation failed.", innerException: ex); }
        try
        {
            var resources = new List<Resource>();
            if (o["resources"] is not JsonArray ra) throw new JsonException();
            foreach (var item in ra)
            {
                if (item is not JsonObject r) throw new JsonException();
                if (r["descriptor"] is JsonValue descriptorValue && descriptorValue.TryGetValue<string>(out var descriptor))
                {
                    resources.Add(new Resource(Protocol.RequiredString(r, "name"), descriptor, new JsonArray(), 0, Array.Empty<ResourceChunk>()));
                    continue;
                }
                var chunks = new List<ResourceChunk>();
                if (r["chunks"] is not JsonArray ca) throw new JsonException();
                foreach (var c in ca)
                {
                    if (c is not JsonObject x) throw new JsonException();
                    chunks.Add(new ResourceChunk(x["sequence"]?.GetValue<int>() ?? throw new JsonException(), Protocol.RequiredString(x, "path"), x["recordCount"]?.GetValue<long>() ?? throw new JsonException(), x["uncompressedBytes"]?.GetValue<long>() ?? throw new JsonException(), Protocol.RequiredString(x, "sha256")));
                }
                resources.Add(new Resource(Protocol.RequiredString(r, "name"), Protocol.RequiredString(r, "schema"), r["identity"]?.AsArray() ?? throw new JsonException(), r["recordCount"]?.GetValue<long>() ?? throw new JsonException(), chunks));
            }
            var p = o["producer"]?.AsObject() ?? throw new JsonException(); var sc = o["scope"]?.AsObject() ?? throw new JsonException(); var co = o["consistency"]?.AsObject() ?? throw new JsonException(); var a = o["assets"]?.AsObject() ?? throw new JsonException(); var i = o["integrity"]?.AsObject() ?? throw new JsonException();
            var level = Protocol.RequiredString(co, "level") switch { "snapshot" => ConsistencyLevel.Snapshot, "bounded" => ConsistencyLevel.Bounded, "best_effort" => ConsistencyLevel.BestEffort, _ => throw new JsonException() };
            return new Manifest(Protocol.RequiredString(o, "format"), version, Protocol.RequiredString(o, "packageId"), Protocol.RequiredString(o, "exportId"), DateTimeOffset.Parse(Protocol.RequiredString(o, "createdAt"), System.Globalization.CultureInfo.InvariantCulture), new(Protocol.RequiredString(p, "name"), Protocol.RequiredString(p, "version")), new(Protocol.RequiredString(sc, "type"), Protocol.RequiredString(sc, "id")), new(level, co["metadata"]?.AsObject()), resources, new(a["count"]?.GetValue<long>() ?? throw new JsonException(), a["totalBytes"]?.GetValue<long>() ?? throw new JsonException()), new(Protocol.RequiredString(i, "algorithm"), i["checksums"]?.GetValue<string>()));
        }
        catch (PaspException) { throw; }
        catch (Exception ex) { throw new PaspException("PASP_INVALID_MANIFEST", "Manifest does not satisfy PASP.", innerException: ex); }
    }

    /// <summary>Loads one embedded canonical PASP schema as JSON.</summary>
    public static JsonNode LoadSchema(string name)
    {
        var file = name.EndsWith(".schema.json", StringComparison.Ordinal) ? name : name + ".schema.json";
        if (!new[] { "manifest.schema.json", "scope.schema.json", "resource.schema.json", "resource-chunk.schema.json", "asset.schema.json", "relationship.schema.json", "checkpoint.schema.json", "event.schema.json", "inspection-result.schema.json" }.Contains(file, StringComparer.Ordinal)) throw new PaspException("PASP_MISSING_SCHEMA", $"Unknown canonical schema: {name}");
        var resource = typeof(OpenExitSdk).Assembly.GetManifestResourceNames().SingleOrDefault(x => x.EndsWith("Schemas." + file, StringComparison.Ordinal));
        if (resource is null) throw new PaspException("PASP_MISSING_SCHEMA", $"Embedded schema is missing: {file}");
        using var s = typeof(OpenExitSdk).Assembly.GetManifestResourceStream(resource)!; return JsonNode.Parse(s) ?? throw new PaspException("PASP_MISSING_SCHEMA", $"Embedded schema is invalid: {file}");
    }

    /// <summary>Inspects a PASP directory bundle and returns metadata and validation errors.</summary>
    public static InspectionResult InspectBundle(string path) => VerifyBundleCore(path, false);
    /// <summary>Verifies a PASP directory bundle, streaming resource and asset data.</summary>
    public static InspectionResult VerifyBundle(string path)
    {
        var result = VerifyBundleCore(path, true);
        if (!result.Valid) throw result.Errors[0];
        return result;
    }

    private static InspectionResult VerifyBundleCore(string path, bool verify)
    {
        var errors = new List<PaspException>(); Manifest? m = null; int chunks = 0; var counts = new Dictionary<string, long>();
        try
        {
            if (!Directory.Exists(path)) throw new PaspException("PASP_MALFORMED_PACKAGE", "Bundle directory is missing.");
            var root = Path.GetFullPath(path);
            var manifestPath = SafePath(root, "manifest.json", "PASP_MALFORMED_PACKAGE");
            if (!File.Exists(manifestPath)) throw new PaspException("PASP_MALFORMED_PACKAGE", "manifest.json is missing.");
            var manifestNode = ParseManifestFile(manifestPath);
            var manifest = manifestNode.AsObject();
            try { m = ValidateManifest(manifestNode); }
            catch (PaspException ex) when (ex.Code == "PASP_INVALID_MANIFEST" && ManifestResourceEntryIsInvalid(manifest))
            {
                throw new PaspException(ManifestResourceEntryHasTraversal(manifest) ? "PASP_PATH_TRAVERSAL" : "PASP_INVALID_RESOURCE", "Manifest contains an invalid resource entry.", innerException: ex);
            }
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in manifest["resources"]!.AsArray())
            {
                var entry = item!.AsObject(); var name = Protocol.RequiredString(entry, "name");
                if (!names.Add(name)) throw new PaspException("PASP_DUPLICATE_RESOURCE", $"Duplicate resource: {name}");
            }
            names.Clear();
            foreach (var item in manifest["resources"]!.AsArray())
            {
                var entry = item!.AsObject(); var name = Protocol.RequiredString(entry, "name");
                if (!names.Add(name)) throw new PaspException("PASP_DUPLICATE_RESOURCE", $"Duplicate resource: {name}");
                var descriptorPath = Protocol.RequiredString(entry, "descriptor"); Protocol.Path(descriptorPath);
                var descriptorFile = SafePath(root, descriptorPath, "PASP_INVALID_RESOURCE");
                if (!File.Exists(descriptorFile)) throw new PaspException("PASP_INVALID_RESOURCE", $"Resource descriptor is missing: {descriptorPath}");
                var descriptor = ParseManifestFile(descriptorFile);
                try { if (!SchemaRegistry.Validate("resource.schema.json", descriptor)) throw new PaspException("PASP_INVALID_RESOURCE", $"Invalid resource descriptor: {name}"); }
                catch (PaspException ex) when (ex.Code == "PASP_INVALID_MANIFEST") { throw new PaspException("PASP_INVALID_RESOURCE", $"Invalid resource descriptor: {name}", innerException: ex); }
                VerifyResource(root, name, descriptor.AsObject(), verify, ref chunks, out var actualCount);
                counts[name] = actualCount;
            }
            VerifyAssets(root, manifest, verify, m, errors);
            VerifyRelationships(root, manifest, verify, names);
        }
        catch (PaspException ex) { errors.Add(ex); }
        catch (JsonException ex) { errors.Add(new PaspException("PASP_INVALID_MANIFEST", "Malformed PASP JSON.", innerException: ex)); }
        catch (IOException ex) { errors.Add(new PaspException("PASP_MALFORMED_PACKAGE", "Unable to read PASP package.", innerException: ex)); }
        return new InspectionResult(errors.Count == 0, m?.PaspVersion ?? OpenExitInfo.PaspVersion, m?.PackageId, m?.ExportId, m?.Scope, m?.Consistency, m?.Producer, m?.Resources.Select(x => x.Name).ToArray() ?? Array.Empty<string>(), counts, chunks, m?.Assets.Count ?? 0, m?.Assets.TotalBytes ?? 0, 0, errors);
    }

    private static void VerifyResource(string root, string name, JsonObject descriptor, bool verify, ref int chunkTotal, out long actualTotal)
    {
        if (descriptor["schema"] is JsonValue schemaValue && schemaValue.TryGetValue<string>(out var schemaPath))
        {
            Protocol.Path(schemaPath);
            if (!schemaPath.StartsWith("schemas/", StringComparison.Ordinal) || !File.Exists(SafePath(root, schemaPath, "PASP_MISSING_SCHEMA"))) throw new PaspException("PASP_MISSING_SCHEMA", $"Resource schema is missing: {schemaPath}");
        }
        var chunks = descriptor["chunks"]?.AsArray() ?? throw new PaspException("PASP_INVALID_RESOURCE", $"Resource chunks are missing: {name}");
        var recordSchema = descriptor["schema"] is JsonObject inlineSchema ? inlineSchema : null;
        var expected = 1; actualTotal = 0;
        foreach (var node in chunks)
        {
            var chunk = node!.AsObject(); var sequence = chunk["sequence"]?.GetValue<int>() ?? throw new PaspException("PASP_INVALID_RESOURCE", "Chunk sequence is invalid.");
            var path = Protocol.RequiredString(chunk, "path"); Protocol.Path(path);
            var fileName = Path.GetFileName(path); if (sequence != expected || fileName != $"{sequence:00000000}.ndjson") throw new PaspException("PASP_INVALID_RESOURCE", $"Chunk sequence or filename is invalid: {path}");
            var file = SafePath(root, path, "PASP_INVALID_RESOURCE"); if (!File.Exists(file)) throw new PaspException("PASP_INVALID_RESOURCE", $"Chunk is missing: {path}");
            var declaredRecords = chunk["recordCount"]?.GetValue<long>() ?? throw new PaspException("PASP_INVALID_RESOURCE", "Chunk record count is invalid.");
            var declaredBytes = chunk["uncompressedBytes"]?.GetValue<long>() ?? throw new PaspException("PASP_INVALID_RESOURCE", "Chunk byte count is invalid.");
            var declaredHash = Protocol.RequiredString(chunk, "sha256");
            if (verify && Protocol.Hash(file) != declaredHash) throw new PaspException("PASP_CHECKSUM_MISMATCH", $"Chunk checksum mismatch: {path}");
            if (new FileInfo(file).Length != declaredBytes) throw new PaspException("PASP_CHECKSUM_MISMATCH", $"Chunk byte count mismatch: {path}");
            var actualRecords = 0L;
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read, 1024 * 1024, FileOptions.SequentialScan))
            using (var reader = new StreamReader(stream, new UTF8Encoding(false, true), detectEncodingFromByteOrderMarks: false))
            {
                string? line; var lineNumber = 0;
                while ((line = reader.ReadLine()) is not null) { lineNumber++; if (line.Length == 0) throw new PaspException("PASP_INVALID_RECORD", $"Empty record at {name}/{path}:{lineNumber}"); JsonNode record; try { record = JsonNode.Parse(line) ?? throw new JsonException(); } catch (Exception ex) when (ex is JsonException or FormatException) { throw new PaspException("PASP_INVALID_RECORD", $"Invalid record at {name}/{path}:{lineNumber}", innerException: ex); } if (record is not JsonObject) throw new PaspException("PASP_INVALID_RECORD", $"Record is not an object at {name}/{path}:{lineNumber}"); if (recordSchema is not null && !SchemaRegistry.ValidateCustom(recordSchema, record)) throw new PaspException("PASP_INVALID_RECORD", $"Record violates resource schema at {name}/{path}:{lineNumber}"); actualRecords++; }
            }
            if (actualRecords != declaredRecords) throw new PaspException("PASP_INVALID_RESOURCE", $"Record count mismatch: {path}");
            actualTotal += actualRecords; expected++; chunkTotal++;
        }
        var declaredTotal = descriptor["recordCount"]?.GetValue<long>() ?? throw new PaspException("PASP_INVALID_RESOURCE", "Resource record count is invalid.");
        if (actualTotal != declaredTotal) throw new PaspException("PASP_INVALID_RESOURCE", $"Resource record count mismatch: {name}");
    }

    private static void VerifyAssets(string root, JsonObject manifest, bool verify, Manifest model, List<PaspException> errors)
    {
        var assets = manifest["assets"]!.AsObject(); var count = assets["count"]!.GetValue<long>();
        if (count == 0) return;
        var index = SafePath(root, "assets/index.ndjson", "PASP_MISSING_ASSET"); if (!File.Exists(index)) throw new PaspException("PASP_MISSING_ASSET", "Asset index is missing.");
        long actualCount = 0, actualBytes = 0;
        using var stream = new FileStream(index, FileMode.Open, FileAccess.Read, FileShare.Read, 1024 * 1024, FileOptions.SequentialScan);
        using var reader = new StreamReader(stream, new UTF8Encoding(false, true), detectEncodingFromByteOrderMarks: false);
        string? line; while ((line = reader.ReadLine()) is not null)
        {
            JsonObject asset; try { asset = (JsonNode.Parse(line) as JsonObject) ?? throw new JsonException(); } catch (Exception ex) when (ex is JsonException or FormatException) { throw new PaspException("PASP_MISSING_ASSET", "Invalid asset descriptor.", innerException: ex); }
            if (!SchemaRegistry.Validate("asset.schema.json", asset)) throw new PaspException("PASP_MISSING_ASSET", "Invalid asset descriptor.");
            var assetPath = Protocol.RequiredString(asset, "path"); Protocol.Path(assetPath); var file = SafePath(root, assetPath, "PASP_PATH_TRAVERSAL"); if (!File.Exists(file)) throw new PaspException("PASP_MISSING_ASSET", $"Asset is missing: {assetPath}");
            var length = new FileInfo(file).Length; if (length != asset["byteLength"]!.GetValue<long>()) throw new PaspException("PASP_CHECKSUM_MISMATCH", $"Asset byte count mismatch: {assetPath}"); if (verify && Protocol.Hash(file) != asset["sha256"]!.GetValue<string>()) throw new PaspException("PASP_CHECKSUM_MISMATCH", $"Asset checksum mismatch: {assetPath}"); actualCount++; actualBytes += length;
        }
        if (actualCount != count || actualBytes != assets["totalBytes"]!.GetValue<long>()) throw new PaspException("PASP_MISSING_ASSET", "Asset summary does not match the index.");
    }

    private static void VerifyRelationships(string root, JsonObject manifest, bool verify, HashSet<string> resourceNames)
    {
        if (manifest["relationships"] is null) return; var file = SafePath(root, "relationships.json", "PASP_INVALID_RELATIONSHIP"); if (!File.Exists(file)) throw new PaspException("PASP_INVALID_RELATIONSHIP", "Relationships file is missing."); var node = ParseManifestFile(file); if (node is not JsonArray relationships) throw new PaspException("PASP_INVALID_RELATIONSHIP", "Relationships must be an array."); foreach (var relationship in relationships) { if (relationship is null || !SchemaRegistry.Validate("relationship.schema.json", relationship)) throw new PaspException("PASP_INVALID_RELATIONSHIP", "Invalid relationship."); var r = relationship.AsObject(); var from = r["from"]!.AsObject(); var to = r["to"]!.AsObject(); if (!resourceNames.Contains(from["resource"]!.GetValue<string>()) || !resourceNames.Contains(to["resource"]!.GetValue<string>())) throw new PaspException("PASP_INVALID_RELATIONSHIP", "Relationship endpoint references an unknown resource."); }
    }

    private static string SafePath(string root, string relative, string code)
    {
        Protocol.Path(relative); var fullRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar; var full = Path.GetFullPath(Path.Combine(fullRoot, relative.Replace('/', Path.DirectorySeparatorChar))); if (!full.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase)) throw new PaspException("PASP_PATH_TRAVERSAL", $"Path escapes package root: {relative}"); var current = fullRoot.TrimEnd(Path.DirectorySeparatorChar); foreach (var part in relative.Split('/')) { current = Path.Combine(current, part); if (File.Exists(current) || Directory.Exists(current)) { var attributes = File.GetAttributes(current); if (attributes.HasFlag(FileAttributes.ReparsePoint)) throw new PaspException("PASP_PATH_TRAVERSAL", $"Reparse point in package path: {relative}"); } }
        return full;
    }

    private static bool ManifestResourceEntryIsInvalid(JsonObject manifest)
    {
        if (manifest["resources"] is not JsonArray resources) return false;
        foreach (var item in resources)
        {
            if (item is not JsonObject entry) return true;
            if (entry["name"] is not JsonValue n || !n.TryGetValue<string>(out var name) || !System.Text.RegularExpressions.Regex.IsMatch(name, "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")) return true;
            if (entry["descriptor"] is not JsonValue d || !d.TryGetValue<string>(out var descriptor) || !System.Text.RegularExpressions.Regex.IsMatch(descriptor, "^resources/[A-Za-z0-9][A-Za-z0-9._-]{0,127}/resource\\.json$")) return true;
        }
        return false;
    }

    private static bool ManifestResourceEntryHasTraversal(JsonObject manifest)
    {
        if (manifest["resources"] is not JsonArray resources) return false;
        foreach (var item in resources.OfType<JsonObject>())
        {
            var value = item["descriptor"]?.GetValue<string>();
            if (value is not null && (value.StartsWith('/') || value.Contains('\\') || value.Split('/').Any(x => x is ".." or "") || System.Text.RegularExpressions.Regex.IsMatch(value, "^[A-Za-z]:"))) return true;
        }
        return false;
    }
}
