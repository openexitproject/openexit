namespace OpenExit.Tests;

internal static class TestRepository
{
    internal static string FindRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "protocol", "pasp", "v1", "conformance", "suite.json")) && File.Exists(Path.Combine(directory.FullName, "LICENSE"))) return directory.FullName;
        }
        throw new DirectoryNotFoundException("Could not locate the OpenExit repository root from the test assembly.");
    }
}
