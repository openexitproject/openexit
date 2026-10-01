using System.Text.Json;
using OpenExit;

namespace OpenExit.Tests;

public sealed class ConformanceTests
{
    [Fact]
    public void SharedSuitePasses()
    {
        var root = TestRepository.FindRoot();
        using var suite = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "protocol", "pasp", "v1", "conformance", "suite.json")));
        var cases = suite.RootElement.GetProperty("cases");
        foreach (var item in cases.EnumerateArray())
        {
            var id = item.GetProperty("id").GetString()!;
            var relative = item.GetProperty("path").GetString()!;
            var expected = item.GetProperty("expected");
            var valid = expected.GetProperty("valid").GetBoolean();
            var path = Path.Combine(root, "protocol", "pasp", "v1", "conformance", relative.Replace('/', Path.DirectorySeparatorChar));
            if (valid)
            {
                var result = OpenExitSdk.VerifyBundle(path);
                Assert.True(result.Valid, $"{id}: {string.Join("; ", result.Errors.Select(x => x.Code + " " + x.Message))}");
            }
            else
            {
                PaspException? error = null;
                try { OpenExitSdk.VerifyBundle(path); } catch (PaspException ex) { error = ex; }
                if (error is null) throw new Xunit.Sdk.XunitException($"{id} unexpectedly passed");
                if (expected.GetProperty("errorCode").GetString() != error.Code) throw new Xunit.Sdk.XunitException($"{id}: expected {expected.GetProperty("errorCode").GetString()}, got {error.Code}");
            }
        }
    }
}
