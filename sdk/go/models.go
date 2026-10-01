package openexit

import "encoding/json"

// Scope identifies the logical state being exported.
type Scope struct {
	Type     string         `json:"type"`
	ID       string         `json:"id"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// ProducerInfo describes the producer of a bundle.
type ProducerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// IntegrityInfo describes package-level integrity metadata.
type IntegrityInfo struct {
	Algorithm string `json:"algorithm"`
	Checksums string `json:"checksums,omitempty"`
}

// ConsistencyLevel is the PASP consistency classification.
type ConsistencyLevel string

const (
	// ConsistencySnapshot means resources share one consistent snapshot.
	ConsistencySnapshot ConsistencyLevel = "snapshot"
	// ConsistencyBounded means capture boundaries are recorded by the producer.
	ConsistencyBounded ConsistencyLevel = "bounded"
	// ConsistencyBestEffort means no global consistency guarantee is made.
	ConsistencyBestEffort ConsistencyLevel = "best_effort"
)

// Consistency describes the consistency level of a bundle.
type Consistency struct {
	Level    ConsistencyLevel `json:"level"`
	Metadata map[string]any   `json:"metadata,omitempty"`
}

// ResourceChunk describes one numbered resource NDJSON file.
type ResourceChunk struct {
	Sequence          int64           `json:"sequence"`
	Path              string          `json:"path"`
	RecordCount       int64           `json:"recordCount"`
	UncompressedBytes int64           `json:"uncompressedBytes"`
	SHA256            string          `json:"sha256"`
	FirstIdentity     json.RawMessage `json:"firstIdentity,omitempty"`
	LastIdentity      json.RawMessage `json:"lastIdentity,omitempty"`
	CompletedAt       string          `json:"completedAt,omitempty"`
}

// Resource describes a logical collection and its chunks.
type Resource struct {
	Name          string          `json:"name"`
	Schema        json.RawMessage `json:"schema"`
	SchemaID      string          `json:"schemaId,omitempty"`
	SchemaVersion string          `json:"schemaVersion,omitempty"`
	Identity      []string        `json:"identity"`
	RecordCount   int64           `json:"recordCount"`
	Chunks        []ResourceChunk `json:"chunks"`
	Ordered       bool            `json:"ordered,omitempty"`
	Metadata      map[string]any  `json:"metadata,omitempty"`
	CapturedAt    string          `json:"capturedAt,omitempty"`
	SnapshotToken string          `json:"snapshotToken,omitempty"`
}

// AssetSummary contains manifest-level asset totals.
type AssetSummary struct {
	Count      int64  `json:"count"`
	TotalBytes int64  `json:"totalBytes"`
	Index      string `json:"index,omitempty"`
}

// RelationshipEndpoint points to a JSON Pointer in a resource.
type RelationshipEndpoint struct {
	Resource string `json:"resource"`
	Pointer  string `json:"pointer"`
}

// Relationship declares an explicit relationship between resources.
type Relationship struct {
	ID          string               `json:"id"`
	From        RelationshipEndpoint `json:"from"`
	To          RelationshipEndpoint `json:"to"`
	Cardinality string               `json:"cardinality"`
	Metadata    map[string]any       `json:"metadata,omitempty"`
}

// Manifest is the parsed PASP bundle manifest.
type Manifest struct {
	Format        string          `json:"format"`
	PASPVersion   string          `json:"paspVersion"`
	PackageID     string          `json:"packageId"`
	ExportID      string          `json:"exportId"`
	CreatedAt     string          `json:"createdAt"`
	Producer      ProducerInfo    `json:"producer"`
	Scope         Scope           `json:"scope"`
	Consistency   Consistency     `json:"consistency"`
	Resources     []ManifestEntry `json:"resources"`
	Assets        AssetSummary    `json:"assets"`
	Integrity     IntegrityInfo   `json:"integrity"`
	Relationships string          `json:"relationships,omitempty"`
}

// ManifestEntry maps a resource name to its descriptor path.
type ManifestEntry struct {
	Name       string `json:"name"`
	Descriptor string `json:"descriptor"`
}

// InspectionError is a compact inspection diagnostic.
type InspectionError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path,omitempty"`
}

// InspectionResult is the canonical PASP inspection result summary.
type InspectionResult struct {
	Valid       bool              `json:"valid"`
	PASPVersion string            `json:"paspVersion"`
	Resources   int64             `json:"resources"`
	Assets      int64             `json:"assets"`
	Errors      []InspectionError `json:"errors"`
}
