# OpenExit

> Portable state for any application.

This package implements PASP — the Portable Application State Protocol — for .NET.

```powershell
dotnet add package OpenExit --version 0.1.0
```

```csharp
using OpenExit;

var manifest = OpenExitSdk.ValidateManifest(
    OpenExitSdk.ParseManifestFile("bundle/manifest.json"));
var inspection = OpenExitSdk.InspectBundle("bundle");
var verified = OpenExitSdk.VerifyBundle("bundle");
```

NuGet package version: 0.1.0  
PASP protocol version: 1.0

The SDK reads, inspects, and verifies local PASP directory bundles. It does not write bundles or support archives, remote storage, adapters, or cloud services.
