#!/usr/bin/env bash

# Run the FDX linter (yamllint and spectral) on the FDX API yaml test files in /config

# Run from the root folder.

export RULESET=config/fdx.test.spectral.ruleset.yaml

./lint.sh config/$1
