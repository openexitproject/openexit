using System.Text.Json.Nodes;
using System.Security.Cryptography;
using OpenExit;

namespace OpenExit.Tests;

public sealed class SecurityAndSchemaTests
{
    [Fact]
    public void AllCanonicalSchemasLoadFromAssembly()
    {
        var names = new[] { "manifest", "scope", "resource", "resource-chunk", "asset", "relationship", "checkpoint", "event", "inspection-result" };
        foreach (var name in names) Assert.NotNull(OpenExitSdk.LoadSchema(name));
    }

    [Fact]
    public void RemoteReferencesAreNotFetched()
    {
        var schema = JsonNode.Parse("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"$ref\":\"https://example.invalid/schema.json\"}")!;
        var error = Assert.Throws<PaspException>(() => SchemaRegistry.ValidateCustom(schema, new JsonObject()));
        Assert.Equal("PASP_INVALID_RECORD", error.Code);
    }

    [Fact]
    public void ReparsePointInsideBundleIsRejected()
    {
        var temp = Path.Combine(Path.GetTempPath(), "openexit-link-test-" + Guid.NewGuid().ToString("N"));
        var bundle = Path.Combine(temp, "bundle");
        var outside = Path.Combine(temp, "outside.ndjson");
        try
        {
            CopyTree(Path.Combine(TestRepository.FindRoot(), "protocol", "pasp", "v1", "conformance", "valid", "minimal"), bundle);
            File.WriteAllText(outside, "{}\n");
            var chunk = Path.Combine(bundle, "resources", "users", "00000001.ndjson");
            File.Delete(chunk);
            File.CreateSymbolicLink(chunk, outside);
            var error = Assert.Throws<PaspException>(() => OpenExitSdk.VerifyBundle(bundle));
            Assert.Equal("PASP_PATH_TRAVERSAL", error.Code);
        }
        catch (UnauthorizedAccessException)
        {
            throw Xunit.Sdk.SkipException.ForSkip("Symbolic-link creation is unavailable in this Windows test environment.");
        }
        finally { if (Directory.Exists(temp)) Directory.Delete(temp, true); }
    }

    [Fact]
    public void LargeFileHashUsesExpectedDigestAndLength()
    {
        var file = Path.Combine(Path.GetTempPath(), "openexit-hash-" + Guid.NewGuid().ToString("N"));
        try
        {
            using (var output = File.Create(file))
            {
                var block = new byte[1024 * 1024];
                for (var i = 0; i < 4; i++) { RandomNumberGenerator.Fill(block); output.Write(block); }
            }
            using var input = File.OpenRead(file);
            using var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            var buffer = new byte[64 * 1024]; int read; long length = 0;
            while ((read = input.Read(buffer)) > 0) { sha.AppendData(buffer, 0, read); length += read; }
            Assert.Equal(4 * 1024 * 1024, length);
            Assert.Equal(Convert.ToHexString(sha.GetHashAndReset()).ToLowerInvariant(), Protocol.Hash(file));
        }
        finally { if (File.Exists(file)) File.Delete(file); }
    }

    private static void CopyTree(string source, string destination)
    {
        foreach (var directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories)) Directory.CreateDirectory(directory.Replace(source, destination));
        foreach (var file in Directory.GetFiles(source, "*", SearchOption.AllDirectories)) { var target = file.Replace(source, destination); Directory.CreateDirectory(Path.GetDirectoryName(target)!); File.Copy(file, target); }
    }
}
