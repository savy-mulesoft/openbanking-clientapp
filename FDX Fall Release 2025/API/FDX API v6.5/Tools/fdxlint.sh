#!/usr/bin/env bash

# Run the FDX linter (yamllint and spectral) on the FDX API yaml source API/$1
# and tee the output (stdout and stderr) to API/reports/$1.linter.report.txt

# Run from the root folder.

./lint.sh API/$1 2>& 1 | tee API/reports/$1.linter.report.txt
