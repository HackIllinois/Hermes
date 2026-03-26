#!/bin/bash
set -euo pipefail

cd /home/ubuntu/hermes

# Remove the previous compiled output and installed dependencies so deleted
# files do not linger across CodeDeploy revisions.
rm -rf dist
rm -rf node_modules
