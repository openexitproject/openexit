namespace OpenExit.Tests;

public sealed class SchemaDriftTests
{
    [Fact]
    public void EmbeddedSourceSchemasMatchProtocol()
    {
        var root = FindRoot();
        var canonical = Directory.GetFiles(Path.Combine(root, "protocol", "pasp", "v1", "schemas"), "*.json").ToDictionary(x => Path.GetFileName(x)!);
        var local = Directory.GetFiles(Path.Combine(root, "sdk", "dotnet", "src", "OpenExit", "Schemas"), "*.json").ToDictionary(x => Path.GetFileName(x)!);
        Assert.Equal(canonical.Keys.Order(), local.Keys.Order());
        foreach (var name in canonical.Keys) Assert.Equal(File.ReadAllBytes(canonical[name]), File.ReadAllBytes(local[name]));
    }

    private static string FindRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "protocol", "pasp", "v1", "conformance", "suite.json"))) return directory.FullName;
        throw new InvalidOperationException("Could not locate the OpenExit repository root.");
    }
}
