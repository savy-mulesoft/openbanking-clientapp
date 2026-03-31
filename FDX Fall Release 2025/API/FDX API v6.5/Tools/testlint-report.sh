#!/usr/bin/env bash

# Run the FDX linter (yamllint and spectral) on the FDX API yaml test files in /config
# and tee the output (stdout and stderr) to API/reports/test.$1.linter.report.txt

# Run from the root folder.

export RULESET=config/fdx.test.spectral.ruleset.yaml

./lint.sh config/$1 2>& 1 | tee API/reports/test.$1.linter.report.txt
