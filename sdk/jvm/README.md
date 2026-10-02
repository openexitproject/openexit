# OpenExit

Portable state for any application.

OpenExit JVM SDK is the Java implementation of PASP (Portable Application State Protocol). SDK version `0.1.0` implements PASP `1.0` and requires Java 17 or newer. The same artifact works from Java, Kotlin, and other JVM languages.

Publication to Maven Central is pending release and namespace verification. Candidate dependency:

```xml
<dependency>
  <groupId>io.github.siddhanthramani</groupId>
  <artifactId>openexit</artifactId>
  <version>0.1.0</version>
</dependency>
```

```java
import io.github.openexitproject.openexit.*;
import io.github.openexitproject.openexit.model.*;
import java.nio.file.Path;

System.out.println(OpenExitInfo.VERSION);       // 0.1.0
System.out.println(OpenExitInfo.PASP_VERSION); // 1.0
Manifest manifest = OpenExit.parseManifest(Path.of("bundle/manifest.json"));
OpenExit.validateManifest(java.nio.file.Files.readAllBytes(Path.of("bundle/manifest.json")));
InspectionResult summary = OpenExit.inspectBundle(Path.of("bundle"));
OpenExit.verifyBundle(Path.of("bundle"));
try {
    OpenExit.verifyBundle(Path.of("bundle"));
} catch (PaspException failure) {
    String code = failure.getCode();
}
```

Kotlin uses the same Maven artifact and Java API:

```kotlin
import io.github.openexitproject.openexit.OpenExit
import io.github.openexitproject.openexit.OpenExitInfo
import java.nio.file.Path

println(OpenExitInfo.VERSION)
OpenExit.verifyBundle(Path.of("bundle"))
```

`loadSchema("manifest.schema.json")` returns a canonical schema packaged in the JAR. Directory bundles are supported; archive and cloud transports are outside this SDK version.
