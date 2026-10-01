using System.Text.Json.Nodes;
using OpenExit;

namespace OpenExit.Tests;

public sealed class SmokeTests
{
    [Fact]
    public void VersionsAreStable()
    {
        Assert.Equal("0.1.0", OpenExitInfo.Version);
        Assert.Equal("1.0", OpenExitInfo.PaspVersion);
    }

    [Fact]
    public void MalformedManifestUsesCanonicalError()
    {
        var error = Assert.Throws<PaspException>(() => OpenExitSdk.ParseManifestJson("{"));
        Assert.Equal("PASP_INVALID_MANIFEST", error.Code);
    }

    [Fact]
    public void UnknownSchemaUsesCanonicalError()
    {
        var error = Assert.Throws<PaspException>(() => OpenExitSdk.LoadSchema("unknown"));
        Assert.Equal("PASP_MISSING_SCHEMA", error.Code);
    }
}
