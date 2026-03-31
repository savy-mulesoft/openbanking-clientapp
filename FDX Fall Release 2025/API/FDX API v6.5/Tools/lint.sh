#!/usr/bin/env bash

# Validate and lint fdxapi.yaml

# Lint the (generated) YAML files
#
# Usage:
#
#   ./lint.sh
#
#   ./lint.sh API/<API name>

COMPONENTS_FILE="API/fdxapi.components.yaml"
CORE_FILE="API/fdxapi.core.yaml"

YAML_LINTRULES="config/yamllint.yaml"
CORE_LINTRULES="config/core-yamllint.yaml"
COMPONENTS_LINTRULES="config/components-yamllint.yaml"

SPECTRAL_RULESET="config/fdx.spectral.ruleset.yaml"

# Set default to lint all of:
ALLAPIS="$COMPONENTS_FILE"
ALLAPIS="$ALLAPIS API/fdxapi.consent.yaml"
ALLAPIS="$ALLAPIS $CORE_FILE"
ALLAPIS="$ALLAPIS API/fdxapi.customer.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.event-notifications.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.extensions.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.fraud.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.meta.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.money-movement.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.payroll.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.recipient-registration.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.registry.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.tax.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.tax1065k3.yaml"
ALLAPIS="$ALLAPIS API/fdxapi.template.yaml"

# The config/yamllint.yaml file disables some warnings (such as for extra space around : delimiters)
# which we may wish to enable in the future. See the "Suggested:" configuration in config/yamllint.yaml
#
# Run from the root folder.
#
# TODO: create lint.cmd for Windows users.

# check if yamllint is in PATH.
if command -v yamllint > /dev/null
then
    runLint=1
else 
    echo Warning: yamllint not installed.
    runLint=0
fi

command -v npm > /dev/null
if [[ $? -gt 0 ]]
then curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
fi

# Docker image installs spectral in /usr/local/bin; see src/docker/Dockerfile
PATH=/usr/local/bin:$PATH
# check if spectral is in PATH.
if command -v spectral > /dev/null
then
    runSpectral=1
else 
    echo Warning: spectral not installed.
    runSpectral=0
fi

if [[ $runLint == 0 && $runSpectral == 0 ]]
then
    echo Neither spectral nor yamllint are installed. Aborting
    exit 1
fi

APIS=$ALLAPIS
if [[ -n "$1" ]]
then
    APIS=$1
else
    if [[ $runSpectral == 1 ]]
    then
        echo -n "Spectral version is: "
        spectral --version
        echo
    fi

    echo Running lint.sh on $APIS
fi

rc=0
for file in $APIS
do
    if [[ $runLint -gt 0 ]]
    then
        LINTRULES=$YAML_LINTRULES

        if [[ $file == $CORE_FILE ]]
        then LINTRULES=$CORE_LINTRULES
        fi

        if [[ $file == $COMPONENTS_FILE ]]
        then LINTRULES=$COMPONENTS_LINTRULES
        fi

        echo Running yamllint on $file with $LINTRULES
        # Note: Set LC_ALL to allow yamllint to parse UTF-8 when run from BitBucket pipeline
        LC_ALL=C.UTF-8 yamllint --format parsable --config-file $LINTRULES $file
        result=$?
        ((rc=rc+$result))

        if [[ $result == 0 ]]
        then echo No yamllint results found
        fi
    fi

    if [[ $runSpectral -gt 0 ]]
    then
        RULESET="${RULESET:-$SPECTRAL_RULESET}"

        echo Running spectral on $file with $RULESET
        spectral lint --ruleset $RULESET $file
        ((rc=rc+$?))
        echo
    fi

done

echo Exiting with code $rc

exit $rc
