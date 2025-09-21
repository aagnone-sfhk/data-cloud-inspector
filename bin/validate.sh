#!/usr/bin/env bash
set -euo pipefail

sf_org_alias=acme
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