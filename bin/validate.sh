#!/usr/bin/env bash
set -euo pipefail

# Global variables
sf_org_alias=""

usage() {
    cat << EOF
Usage: $0 [OPTIONS] <sf_org_alias>

Validate the Data Cloud Inspector API by making a test request.

ARGUMENTS:
    sf_org_alias    Salesforce CLI org alias (e.g., 'acme')

OPTIONS:
    -h, --help      Show this help message and exit

EXAMPLES:
    $0 acme
    $0 my-org

DESCRIPTION:
    This script will:
    1. Extract org details from the specified Salesforce org
    2. Get the Heroku AppLink access token
    3. Make a test API call to the unified B2B endpoint

PREREQUISITES:
    - Heroku CLI installed and authenticated
    - Salesforce CLI installed and authenticated
    - Heroku app deployed with AppLink configured
EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -*)
                echo "Error: Unknown option $1" >&2
                usage
                exit 1
                ;;
            *)
                if [[ -z "$sf_org_alias" ]]; then
                    sf_org_alias="$1"
                else
                    echo "Error: Too many arguments" >&2
                    usage
                    exit 1
                fi
                ;;
        esac
        shift
    done

    # Validate required arguments
    if [[ -z "$sf_org_alias" ]]; then
        echo "Error: Missing required argument: sf_org_alias" >&2
        usage
        exit 1
    fi

    echo "Using Salesforce org alias: $sf_org_alias"
}

validate_api() {
    org_domain=$(sf org display -o $sf_org_alias --json | jq -r .result.instanceUrl | sed 's|https://||')
    access_token=$(heroku config:get HEROKU_APPLINK_TOKEN)
    org_id=$(sf org display -o $sf_org_alias --json | jq -r .result.id)
    user_id=$(sf org display user -o $sf_org_alias --json | jq -r .result.id)
    
    ./bin/invoke.sh \
      $org_domain \
      $access_token \
      $org_id \
      $user_id \
      GET '/datacloud/analysis/unified-b2b?segment=Mid-Market'
}

main() {
    parse_arguments "$@"
    validate_api
}

main "$@"