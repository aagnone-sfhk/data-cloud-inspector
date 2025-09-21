#!/usr/bin/env bash
set -euo pipefail

# Global variables
sf_org_alias=""
agentforce_agent_user_email=""

usage() {
    cat << EOF
Usage: $0 [OPTIONS] <sf_org_alias> <agentforce_agent_user_email>

Initialize a new Data Cloud Inspector Heroku app with Salesforce connections.

ARGUMENTS:
    sf_org_alias                 Salesforce CLI org alias (e.g., 'acme')
    agentforce_agent_user_email  Email of the Agentforce agent user

OPTIONS:
    -h, --help                   Show this help message and exit

EXAMPLES:
    $0 acme data_cloud_agent@00dho00000dykny.ext
    $0 my-org agent@example.com

DESCRIPTION:
    This script will:
    1. Create a new Heroku app called 'data-cloud-inspector'
    2. Configure buildpacks and add-ons
    3. Connect to Salesforce and Data Cloud
    4. Publish the API specification to Salesforce
    5. Assign permission sets to users

PREREQUISITES:
    - Heroku CLI installed and authenticated
    - Salesforce CLI installed and authenticated
    - Git repository with 'main' branch
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
                elif [[ -z "$agentforce_agent_user_email" ]]; then
                    agentforce_agent_user_email="$1"
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

    if [[ -z "$agentforce_agent_user_email" ]]; then
        echo "Error: Missing required argument: agentforce_agent_user_email" >&2
        usage
        exit 1
    fi

    # Validate email format (basic check)
    if [[ ! "$agentforce_agent_user_email" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
        echo "Error: Invalid email format for agentforce_agent_user_email: $agentforce_agent_user_email" >&2
        exit 1
    fi

    echo "Using Salesforce org alias: $sf_org_alias"
    echo "Using Agentforce agent email: $agentforce_agent_user_email"
}

initialize_app() {
    git remote remove heroku || true
    heroku create data-cloud-inspector
    heroku buildpacks:add heroku/heroku-applink-service-mesh
    heroku buildpacks:add heroku/nodejs
    heroku addons:create heroku-applink
    heroku config:set HEROKU_APP_ID="$(heroku apps:info --json | jq -r '.app.id')"
    heroku config:set DC_CONNECTION_NAME=auth-dc-acme
    git push heroku main
    heroku config -s > .env
}

attach_to_salesforce() {
    heroku salesforce:connect sf-agnone-storm
    heroku salesforce:authorizations:add auth-sf-agnone-storm

    heroku datacloud:connect dc-agnone-storm
    heroku datacloud:authorizations:add auth-dc-agnone-storm

    heroku salesforce:connect sf-acme
    heroku salesforce:authorizations:add auth-sf-acme

    heroku datacloud:connect dc-acme
    heroku datacloud:authorizations:add auth-dc-acme
}

publish_to_salesforce() {
    heroku salesforce:publish api-spec.yaml \
        --client-name DataCloudInspector \
        --connection-name sf-acme \
        --authorization-connected-app-name DataCloudInspector \
        --authorization-permission-set-name DataCloudInspectorPS

    # Assigns the permission set to your user (as authenticated by the Salesforce CLI)
    sf org assign permset --name DataCloudInspectorPS -o $sf_org_alias

    # Assigns the permission set to the Agentforce agent user
    sf org assign permset -o $sf_org_alias -n DataCloudInspectorPS -b $agentforce_agent_user_email
}

main() {
    parse_arguments "$@"
    initialize_app
    attach_to_salesforce
    publish_to_salesforce
}

main "$@"
