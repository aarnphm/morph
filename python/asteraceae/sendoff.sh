#!/usr/bin/env bash

set -euo pipefail

# Color codes for different services
SYS_COLOR="\033[0;31m" # Red
RESET_COLOR="\033[0m"

echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Building BentoML service..."
# Run bentoml build and capture the output
BUILD_OUTPUT=$(bentoml build -o tag)

# Extract the tag using grep and awk
TAG=$(echo "$BUILD_OUTPUT" | grep -o "__tag__:asteraceae-inference-api:[a-z0-9]*" | awk -F':' '{print $2":"$3}')

if [ -z "$TAG" ]; then
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Failed to extract tag from build output"
  exit 1
fi

echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Extracted tag: $TAG"

# Update the deploy.yaml file with the new tag
# Using sed with different delimiters since the tag contains colons
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS version of sed requires an empty string for -i
  sed -i '' "s|^bento: .*|bento: $TAG|" deploy.yaml
else
  # Linux version of sed
  sed -i "s|^bento: .*|bento: $TAG|" deploy.yaml
fi

echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Updated deploy.yaml with new tag: $TAG"
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Ready to deploy!"
