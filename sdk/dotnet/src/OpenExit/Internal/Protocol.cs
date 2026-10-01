using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;

namespace OpenExit;

internal static class Protocol
{
    internal static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = false };
    internal static string Error(string code) => code;

    internal static JsonObject Parse(string text)
    {
        try { return JsonNode.Parse(text)?.AsObject() ?? throw new JsonException("Manifest must be an object."); }
        catch (Exception ex) when (ex is JsonException or FormatException) { throw new PaspException("PASP_INVALID_MANIFEST", "Manifest JSON is invalid.", innerException: ex); }
    }

    internal static string RequiredString(JsonObject o, string name)
    {
        if (o[name] is not JsonValue v || !v.TryGetValue<string>(out var s) || string.IsNullOrEmpty(s)) throw new PaspException("PASP_INVALID_MANIFEST", $"Manifest field '{name}' is invalid.");
        return s;
    }

    internal static void Path(string raw)
    {
        if (string.IsNullOrEmpty(raw) || raw.IndexOf('\0') >= 0 || raw.Contains('\\') || raw.StartsWith('/') || raw.StartsWith("//") || System.Text.RegularExpressions.Regex.IsMatch(raw, "^[A-Za-z]:") || raw.Split('/').Any(x => x is ".." or "")) throw new PaspException("PASP_PATH_TRAVERSAL", $"Unsafe PASP path: {raw}");
    }

    internal static string Hash(string file)
    {
        using var stream = File.OpenRead(file);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[1024 * 1024]; int read; long count = 0;
        while ((read = stream.Read(buffer, 0, buffer.Length)) != 0) { hash.AppendData(buffer, 0, read); count += read; }
        return Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
    }
}
