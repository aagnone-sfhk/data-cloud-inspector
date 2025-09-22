#!/usr/bin/env bash
set -euo pipefail

# Global variables
sf_org_alias=""
agentforce_agent_user_email=""
heroku_app_name=""
api_client_name="MyDataCloudInspector"
permission_set_name="MyDataCloudInspectorPS"

usage() {
    cat << EOF
Usage: $0 [OPTIONS] <sf_org_alias> <agentforce_agent_user_email>

Configure Data Cloud Inspector Heroku app with Salesforce connections.

ARGUMENTS:
    sf_org_alias                 Salesforce CLI org alias (e.g., 'acme')
    agentforce_agent_user_email  Email of the Agentforce agent user

OPTIONS:
    -h, --help                   Show this help message and exit

EXAMPLES:
    $0 acme data_cloud_agent@00dho00000dykny.ext
    $0 my-org agent@example.com

DESCRIPTION:
    This script configures your Data Cloud Inspector app with Salesforce connections.
    
    The Heroku Button deployment (app.json) already handles:
    • Heroku AppLink addon installation
    • Required buildpacks (service-mesh + nodejs)
    • App creation and initial deployment
    
    This script adds:
    • Salesforce and Data Cloud connections
    • API specification publishing
    • Permission set assignments

PREREQUISITES:
    - Heroku CLI with AppLink plugin installed
    - Salesforce CLI installed and authenticated
    - Run from your cloned app directory (after Heroku Button deployment)
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

    echo "✅ Using Salesforce org alias: $sf_org_alias"
    echo "✅ Using Agentforce agent email: $agentforce_agent_user_email"
}

detect_heroku_app() {
    echo ""
    echo "🔍 Detecting Heroku app..."
    
    # Check if we have a heroku remote
    if git remote get-url heroku &>/dev/null; then
        heroku_app_name=$(git remote get-url heroku | sed 's/.*\/\([^.]*\)\.git/\1/')
        echo "✅ Found Heroku app: $heroku_app_name"
        
        # Verify the app exists and has AppLink addon (should be from app.json)
        if ! heroku addons -a "$heroku_app_name" | grep -q heroku-applink; then
            echo "❌ Error: Heroku AppLink addon not found on app '$heroku_app_name'"
            echo "   This script expects an app deployed via the Heroku Button"
            exit 1
        fi
        echo "✅ AppLink addon confirmed"
        
        return 0
    else
        echo "❌ Error: No Heroku remote found"
        echo "   This script is designed for apps deployed via Heroku Button"
        echo "   Please deploy via the button first, then clone and run this script"
        exit 1
    fi
}

configure_app() {
    echo ""
    echo "⚙️  Configuring app settings..."
    
    # Set the Data Cloud connection name to match what we'll create
    heroku config:set DC_CONNECTION_NAME="auth-dc-$sf_org_alias" -a "$heroku_app_name"
    echo "✅ Set DC_CONNECTION_NAME=auth-dc-$sf_org_alias"
    
    # Save config to local .env file for development
    heroku config -s -a "$heroku_app_name" > .env
    echo "💾 Saved config to .env file for local development"
}

setup_salesforce_connections() {
    echo ""
    echo "🔗 Setting up Salesforce and Data Cloud connections..."
    
    # Connect to Salesforce org
    echo "📡 Connecting to Salesforce org: $sf_org_alias"
    heroku salesforce:connect "sf-$sf_org_alias" -a "$heroku_app_name"
    heroku salesforce:authorizations:add "auth-sf-$sf_org_alias" -a "$heroku_app_name"
    
    # Connect to Data Cloud
    echo "☁️  Connecting to Data Cloud: $sf_org_alias"
    heroku datacloud:connect "dc-$sf_org_alias" -a "$heroku_app_name"
    heroku datacloud:authorizations:add "auth-dc-$sf_org_alias" -a "$heroku_app_name"
    
    echo "✅ Salesforce and Data Cloud connections established"
}

publish_api_spec() {
    echo ""
    echo "📤 Publishing API specification to Salesforce..."
    
    # Check if api-spec.yaml exists
    if [[ ! -f "api-spec.yaml" ]]; then
        echo "❌ Error: api-spec.yaml not found in current directory"
        echo "   Make sure you're running this script from the root of your cloned app"
        exit 1
    fi
    
    # Publish the API specification
    heroku salesforce:publish api-spec.yaml \
        --client-name $api_client_name \
        --connection-name "sf-$sf_org_alias" \
        --authorization-connected-app-name $api_client_name \
        --authorization-permission-set-name $permission_set_name \
        -a "$heroku_app_name"
    
    echo "✅ API specification published to Salesforce"
}

assign_permissions() {
    echo ""
    echo "🔐 Assigning permission sets..."
    
    # Assign the permission set to your user (as authenticated by the Salesforce CLI)
    sf org assign permset --name $permission_set_name -o "$sf_org_alias"
    echo "✅ Permission set assigned to your user"
    
    # Assign the permission set to the Agentforce agent user
    sf org assign permset -o "$sf_org_alias" -n $permission_set_name -b "$agentforce_agent_user_email"
    echo "✅ Permission set assigned to Agentforce agent user"
}

print_summary() {
    echo ""
    echo "🎉 Configuration completed successfully!"
    echo ""
    echo "📋 Summary:"
    echo "   • Heroku app: $heroku_app_name"
    echo "   • Salesforce org: $sf_org_alias"  
    echo "   • Data Cloud connection: auth-dc-$sf_org_alias"
    echo "   • Agentforce agent: $agentforce_agent_user_email"
    echo ""
    echo "🌐 Your app is available at: https://$heroku_app_name.herokuapp.com"
    echo ""
    echo "💡 Next steps:"
    echo "   • Customize queries in src/lib/sql/queries.js for your Data Cloud org"
    echo "   • Test the Data Cloud endpoints with your actual data"
}

main() {
    echo "🚀 Data Cloud Inspector Configuration"
    echo "====================================="
    
    parse_arguments "$@"
    detect_heroku_app
    configure_app
    setup_salesforce_connections
    publish_api_spec
    assign_permissions
    print_summary
}

main "$@"