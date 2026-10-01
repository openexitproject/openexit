package openexit

import (
	"fmt"
	"os"
)

// InspectBundle reads bounded manifest metadata and returns a compact summary.
func InspectBundle(root string) (*InspectionResult, error) {
	r, err := os.OpenRoot(root)
	if err != nil {
		return nil, pasp("PASP_MALFORMED_PACKAGE", "inspect bundle", root, err)
	}
	defer r.Close()
	b, err := r.ReadFile("manifest.json")
	if err != nil {
		return nil, pasp("PASP_MALFORMED_PACKAGE", "inspect bundle", "manifest.json", err)
	}
	if err := ValidateManifest(b); err != nil {
		return nil, err
	}
	m, err := ParseManifest(b)
	if err != nil {
		return nil, pasp("PASP_INVALID_MANIFEST", "inspect bundle", "manifest.json", err)
	}
	return &InspectionResult{Valid: true, PASPVersion: m.PASPVersion, Resources: int64(len(m.Resources)), Assets: m.Assets.Count, Errors: []InspectionError{}}, nil
}

func openBundleFile(root *os.Root, path string) (*os.File, error) { return safeRootPath(root, path) }
func missing(code, op, path string, err error) error {
	if os.IsNotExist(err) {
		return pasp(code, op, path, fmt.Errorf("missing bundle entry"))
	}
	return err
}
