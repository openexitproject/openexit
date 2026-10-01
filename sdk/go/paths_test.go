package openexit

import "testing"

func TestProtocolPaths(t *testing.T) {
	tests := []struct {
		path  string
		valid bool
	}{{"resources/users/resource.json", true}, {"../foo", false}, {"../../foo", false}, {"/foo", false}, {`C:\foo`, false}, {"C:/foo", false}, {`\\server\share`, false}, {"foo\\../bar", false}, {"foo/../bar", false}, {"foo\x00bar", false}}
	for _, tc := range tests {
		tc := tc
		t.Run(tc.path, func(t *testing.T) {
			got := validatePackagePath(tc.path) == nil
			if got != tc.valid {
				t.Fatalf("valid=%v want %v", got, tc.valid)
			}
		})
	}
}
