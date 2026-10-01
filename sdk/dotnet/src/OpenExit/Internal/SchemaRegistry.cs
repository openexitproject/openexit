using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;

namespace OpenExit;

internal static class SchemaRegistry
{
    private static readonly string[] Names =
    ["manifest.schema.json", "scope.schema.json", "resource.schema.json", "resource-chunk.schema.json", "asset.schema.json", "relationship.schema.json", "checkpoint.schema.json", "event.schema.json", "inspection-result.schema.json"];
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, Lazy<JsonSchema>> Cache = new(StringComparer.Ordinal);

    internal static JsonSchema Get(string name)
    {
        var file = name.EndsWith(".schema.json", StringComparison.Ordinal) ? name : name + ".schema.json";
        if (!Names.Contains(file, StringComparer.Ordinal)) throw new PaspException("PASP_MISSING_SCHEMA", $"Unknown canonical schema: {name}");
        return Cache.GetOrAdd(file, static key => new Lazy<JsonSchema>(() => BuildRoot(key), LazyThreadSafetyMode.ExecutionAndPublication)).Value;
    }

    internal static bool Validate(string schemaName, JsonNode instance)
    {
        var schema = Get(schemaName);
        using var document = JsonDocument.Parse(instance.ToJsonString());
        var options = EvaluationOptions.Default;
        options.RequireFormatValidation = true;
        var result = schema.Evaluate(document.RootElement, options);
        if (!result.IsValid)
        {
            var detail = result.Errors is null ? result.SchemaLocation?.ToString() ?? "schema validation failed" : string.Join("|", result.Errors.Values);
            throw new PaspException("PASP_INVALID_MANIFEST", "Schema validation failed: " + detail);
        }
        return true;
    }

    internal static bool ValidateCustom(JsonNode schemaNode, JsonNode instance)
    {
        try
        {
            var registry = new Json.Schema.SchemaRegistry { Fetch = (_, _) => null };
            var options = BuildOptions.Default;
            options.SchemaRegistry = registry;
            var schema = JsonSchema.FromText(schemaNode.ToJsonString(), options);
            using var document = JsonDocument.Parse(instance.ToJsonString());
            return schema.Evaluate(document.RootElement, EvaluationOptions.Default).IsValid;
        }
        catch (Exception ex) when (ex is JsonException or RefResolutionException or InvalidOperationException)
        {
            throw new PaspException("PASP_INVALID_RECORD", "Resource schema reference is unavailable.", innerException: ex);
        }
    }

    private static JsonSchema BuildEmbedded(string file, BuildOptions options)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("OpenExit.Schemas." + file)
            ?? throw new PaspException("PASP_MISSING_SCHEMA", $"Embedded schema is missing: {file}");
        using var reader = new StreamReader(stream, System.Text.Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        try { return JsonSchema.FromText(reader.ReadToEnd(), options); }
        catch (Exception ex) when (ex is JsonException or RefResolutionException or InvalidOperationException)
        { throw new PaspException("PASP_MISSING_SCHEMA", $"Canonical schema could not be loaded: {file}", innerException: ex); }
    }

    private static JsonSchema BuildRoot(string file)
    {
        var registry = new Json.Schema.SchemaRegistry { Fetch = (_, _) => null };
        var options = BuildOptions.Default;
        options.SchemaRegistry = registry;
        if (file == "manifest.schema.json") _ = BuildEmbedded("scope.schema.json", options);
        if (file == "resource.schema.json") _ = BuildEmbedded("resource-chunk.schema.json", options);
        return BuildEmbedded(file, options);
    }
}
