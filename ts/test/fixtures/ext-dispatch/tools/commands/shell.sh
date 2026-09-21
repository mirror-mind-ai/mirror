#!/bin/sh
# `mirror-cli-v1` is language-neutral, and this is the fixture that proves it:
# not Node, not Python, just an executable the manifest declared.
echo "shell saw $# argument(s): $*"
echo "ext=$MIRROR_EXTENSION_ID prefix=$MIRROR_TABLE_PREFIX"
