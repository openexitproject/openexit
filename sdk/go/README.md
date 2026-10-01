# OpenExit

Portable state for any application.

This is the Go implementation of PASP, the Portable Application State Protocol.

- SDK version: `0.1.0`
- PASP version: `1.0`

Install the released module with:

```sh
go get github.com/openexitproject/openexit/sdk/go@v0.1.0
```

```go
package main

import (
	"errors"
	"fmt"

	openexit "github.com/openexitproject/openexit/sdk/go"
)

func main() {
	fmt.Println(openexit.Version, openexit.PASPVersion)

	data := []byte(`{"format":"openexit.bundle","paspVersion":"1.0"}`)
	_, _ = openexit.ParseManifest(data)
	_ = openexit.ValidateManifest(data)
	_, _ = openexit.InspectBundle("./bundle")
	_ = openexit.VerifyBundle("./bundle")

	if err := openexit.VerifyBundle("./bundle"); err != nil {
		var protocolErr *openexit.PASPError
		if errors.As(err, &protocolErr) {
			fmt.Println(protocolErr.Code)
		}
	}
}
```
