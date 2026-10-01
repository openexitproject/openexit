package openexit

import (
	"fmt"
	"os"
	"strings"
)

func validatePackagePath(value string) error {
	if value == "" || strings.IndexByte(value, 0) >= 0 || strings.Contains(value, "\\") {
		return fmt.Errorf("unsafe package path")
	}
	if strings.HasPrefix(value, "/") || strings.HasPrefix(value, "~") {
		return fmt.Errorf("absolute package path")
	}
	if len(value) >= 2 && ((value[0] >= 'A' && value[0] <= 'Z') || (value[0] >= 'a' && value[0] <= 'z')) && value[1] == ':' {
		return fmt.Errorf("drive-qualified package path")
	}
	if strings.HasPrefix(value, "//") {
		return fmt.Errorf("UNC package path")
	}
	for _, part := range strings.Split(value, "/") {
		if part == "" || part == "." || part == ".." {
			return fmt.Errorf("unsafe path segment")
		}
	}
	return nil
}

func safeRootPath(root *os.Root, value string) (*os.File, error) {
	if err := validatePackagePath(value); err != nil {
		return nil, pasp("PASP_PATH_TRAVERSAL", "open", value, err)
	}
	f, err := root.Open(value)
	if err != nil {
		return nil, err
	}
	return f, nil
}
