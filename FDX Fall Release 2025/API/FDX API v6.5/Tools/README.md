# Financial Data Exchange (FDX) API

Repository for FDX API Data Structures Working Group artifacts under source control.

# Official Disclaimers

Source for these legal notices is on FDX Confluence page
[FDX API schema validation tools](https://fdx.atlassian.net/wiki/spaces/FDX/pages/2870476802/FDX+API+schema+validation+tools).

## Legal Notices

Financial Data Exchange, LLC (FDX) is a standards body and provides these Schema Validation Tools
for general use among industry stakeholders. Many of the terms, however, are subject to additional
interpretations under prevailing laws, industry norms, and/or governmental regulations. While referencing
certain laws that may be applicable, readers, users, members, or any other parties should seek legal
advice of counsel relating to their particular practices and applicable laws in the jurisdictions where
they do business. See FDX’s complete Legal Disclaimer located at http://www.financialdataexchange.org
for other applicable disclaimers. The information provided herein is for educational purposes only and
is not intended to be a guide for any specific company. Each company should consult with its own legal,
IT, data security, financial, tax, and other advisors before implementing any programs described herein.
References to the U.S. market, U.S. laws, and the like, will require certain modification or analysis to
confirm applicability in other jurisdictions.

## FDX API License Agreement

Use of any of the tools listed here are subject to your acceptance of the FDX API License Agreement,
as amended.  The FDX API License Agreement, as well as your acceptance of the FDX Terms of Use, and
FDX Privacy Policy must first be accepted by contacting FDX at https://www.financialdataexchange.org
and selecting “Get Started” before using any of the FDX API Schema Validation Tools.

## References to Other Software, Toolsets, and Open Source Materials

References to other sites, sample code, and resources provided by third parties are provided for your
convenience only and shall not be deemed an endorsement nor recommendation by FDX. Each party is
subject to complying with all applicable license agreements and FDX grants no such rights. Any use of
these open source tools and other materials referenced here are governed by each tool’s own license.
Refer to and understand those licenses before adopting and using in your environment at your own risk
and obligation for compliance thereto. We have no control over the contents of those sites or resources
and accept no responsibility for them or for any loss or damage that may arise from your use of them.
If you decide to access any of the third-party websites linked herein, software, toolsets, sample code,
and/or open source materials, you do so entirely at your own risk and subject to the terms and
conditions of use for such websites and third-party rights. FDX asserts no ownership, copyright,
or other claims to any third-party materials, software, or other tools referenced or mentioned herein.

# Contributing

This repository follows the Gitflow Workflow
(https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow).
Before contributing, you should familiarize yourself with this workflow,
especially regarding feature branching and pull requests.

## FDX API Release flow

The process we are following for RFC additions for a new FDX release is as follows:

* Confirm that latest release was merged to `main` branch and tagged with that release's version number
* Create a feature branch to update the API release full version:
  * In .fdx_version file: `FDX_VERSION="v6.4.0"`
  * In each API/fdxapi.*.yaml file, lines 3 - 5
    ```yaml
      version: '6.4.0'
      title: FDX V6.4.0 Shared Components API
      description: Financial Data Exchange V6.4.0 Shared Components API
    ```
  * For a major release, also update major version number on lines 14-15
    ```yaml
      - url: 'https://api.fi.com/fdx/v6'
        description: Financial Data Exchange V6 Core API
    ```
* A) Create a PR from the feature branch, review, approve and merge the version update
* B) The merge triggers a pipeline build of a new branch containing yamllint and spectral validations, metrics counting, and zip file creation
* C) If that `feature/build-NNNN` branch contains meaningful changes such as validation errors or new versioned files; create a PR from it, review, approve and merge
* Then for each RFC change in the release:
  * Create a new feature branch for the RFC changes
    * Include any fixes needed for validation errors introduced in last RFC, and
  * Commit RFC feature branch to repository
  * Repeat steps A) - C) for the RFC branch
* After last RFC and branch builds for the release have been merged, then complete the release by:
  * Merge `develop` branch to `main`
  * Tag `main` with the latest version number for the release

All versions after V4.0 will remain in this repository, and releases will be tagged with their version number.

Long-lived errata release versions will become their own branch.

## FDX API Metrics:

For counts of the API elements, see:

* [API_metrics_v6.5.0.md](./metrics/API_metrics_v6.5.0.md) 
* [API_metrics_v6.4.1.md](./metrics/API_metrics_v6.4.1.md) 
* [API_metrics_v6.3.1.md](./metrics/API_metrics_v6.3.1.md) 
* [API_metrics_v6.2.0.md](./metrics/API_metrics_v6.2.0.md) 
* [API_metrics_v6.1.0.md](./metrics/API_metrics_v6.1.0.md) 
* [API_metrics_v6.0.0.md](./metrics/API_metrics_v6.0.0.md) 
* [API_metrics_v5.4.0.md](./metrics/API_metrics_v5.4.0.md) 
* [API_metrics_v5.3.4.md](./metrics/API_metrics_v5.3.4.md) 

## Gitflow Workflow Example Commands

### Initial Set Up

```bash
# Go to your local code folder
cd dev
# Clone the repository
# Use the Clone button in the upper-right corner of 
# https://bitbucket.org/fdxdev/fdxapi/src/main/
git clone https://yourusername@bitbucket.org/fdxdev/fdxapi.git
```

### For each unit of change being made

### Proposed Branching Model
#### "develop"
* There will be two primary branches - main and develop
* All work is carried out via feature branches
* A feature branch must be created for any new work e.g., modification of a tax form
* A feature branch is always created off the develop branch
* A feature branch is to be named as `feature-<RFC number>-<feature name>` or `feature-<JIRA number>`
* A feature branch must always merge back into develop branch
* All of paths, parameters and schemas sections should be kept in alphabetical order
* Optionally, types should be sorted down to end of schemas section, after all entities (as done in existing main/large yaml files)
* Run ./lint.sh before commits (or at least before PRs) to ensure no new yaml validation errors are introduced
* For newly added yaml files, add the new filename everywhere that yaml files are listed. That includes:   
    * bitbucket-pipelines.yaml
    * lint.sh
    * runlinter.sh

```bash
# Go to develop branch - ALWAYS START HERE IN develop BRANCH!
git checkout develop
# Make sure up-to-date
git pull origin develop

# Create a feature branch
git checkout -b feature/rfc-0xxx-short-name

# Edit feature content

# Periodically, integrate any changes
git pull origin develop

# When ready, create pull request for feature.
git add --all
git commit -m "Explanation"
git status
git push origin feature/rfc-0xxx-short-name

# Git will show a link to a pull request form.
# Complete the form. Submit the request.

# After pull request is merged
# Remove your local feature branch

# Go back to develop branch
git checkout develop
# List your local branches
git branch
# Delete the branch
git branch -d feature/rfc-0xxx-short-name 

```

## Legacy Versions

Versions prior to 4.0 were moved to the legacy DD-API repository, https://bitbucket.org/fdxdev/dd-api/src/main/.

## Repository folder structure

| Folder | Contents |
|--------|-------------|
| `/` (root) | Configuration and command files |
| `/API` | Editable source yaml files |
| `/API/reports` | Yamllint and Spectral output report files |
| `/config` | Config and test files for linting and validation |
| `/metrics` | Scripts and files for line-categorizing and counting |

## Bitbucket Pipeline

The repository pipeline build uses FDX Docker images defined at fdxdockerhub/fdx-lint-spectral, which contain yamllint and spectral tools used by scripts below.

See https://hub.docker.com/r/fdxdockerhub/fdx-lint-spectral for more information and all the available tags and their Dockerfile scripts to create them.

The FDX docker image options (as of FDX V6.4.0), both using Spectral v6.14.3. (The tag with 'lts' means the Long Term Support version of node, currently version 20.)

* Using Node v20: **fdx-lint-spectral:lts-slim**
* Node v21: fdx-lint-spectral:slim

Docker image maintenance and changes can be made by:

* Open an FDX Support request with FDX consulting firm Prakat, email fdxsupport@financialdataexchange.org
* Login accounts and credentials are held by Prakat

## Build scripts and validation tools

Scripts and tools which the pipeline uses during the build process:

* Lint and Spectral analysis of yaml files
    * Creation of output reports for each analysis
    * See `fdxlint.sh` and `lint.sh`
* Counting detailed metrics of FDX API files
    * Produces `API_metrics_Vxxx.md` files
    * Scripts are in `/metrics` folder
* Bundling release artifacts as `.zip` archives
    * See `zip_files.sh`

Full description of these tools and how to use them in your own environment are available on FDX Confluence
at [FDX API schema validation tools](https://fdx.atlassian.net/wiki/spaces/FDX/pages/2870476802/FDX+API+schema+validation+tools).

### Adding new scripts

If you are working on a Windows machine and need to commit a new script file to the repository for
execution during a pipeline build, you will need to ensure the file is executable in Linux.

The steps to do that are:

* List files from the command line:
    * `git ls-files -s -- '*.sh'`
*  Executable files look like:
    * `100755 a76112fff719809419b4f4d9cec07085ed691b1a 0       fdxlint.sh`
*  Non-executable files look like:
    * `100644 eac5647de34f973ae49ea4ff55b08a4c5d113a87 0       fdx_new_lint.sh`
        * (instead of starting `100755`)
* To add the executable bits, run command:
    * `git update-index --chmod=+x fdx_new_lint.sh`
* Then add, commit and push the file to repository as usual
