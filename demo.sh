#!/bin/bash
# twake-cli demo — showcases Chat, Drive, and Mail commands
#
# Record:  asciinema rec --cols 90 --rows 30 demo.cast -c "bash demo.sh"
# Convert: agg demo.cast demo.gif  (or upload: asciinema upload demo.cast)
#
# Run with: bash demo.sh

set -e
cd "$(dirname "$0")"

# Colors
G='\033[1;32m'  # Green
C='\033[1;36m'  # Cyan
Y='\033[1;33m'  # Yellow
W='\033[1;37m'  # White
R='\033[0m'     # Reset

type_slow() {
  echo ""
  echo -ne "${C}\$ ${W}"
  for (( i=0; i<${#1}; i++ )); do
    echo -n "${1:$i:1}"
    sleep 0.04
  done
  echo -e "${R}"
  sleep 0.3
}

section() {
  echo ""
  echo -e "${Y}━━━ $1 ━━━${R}"
  sleep 0.5
}

echo -e "${G}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║         twake-cli demo v0.1.0         ║"
echo "  ║  CLI for Twake Workplace by Linagora  ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${R}"
sleep 1

# Auth status
section "Authentication Status"
type_slow "node bin/twake.js auth whoami"
node bin/twake.js auth whoami
sleep 1

# Chat
section "Twake Chat (Matrix Protocol)"
type_slow "node bin/twake.js chat rooms"
node bin/twake.js chat rooms
sleep 1

type_slow "node bin/twake.js chat send '!JIdHIALrfERppYiLhI:twake.app' 'Hello from the twake-cli demo!'"
node bin/twake.js chat send '!JIdHIALrfERppYiLhI:twake.app' 'Hello from the twake-cli demo!'
sleep 1

type_slow "node bin/twake.js chat history '!JIdHIALrfERppYiLhI:twake.app' -n 5"
node bin/twake.js chat history '!JIdHIALrfERppYiLhI:twake.app' -n 5
sleep 1

# Drive
section "Twake Drive (Cozy API)"
type_slow "node bin/twake.js drive ls"
node bin/twake.js drive ls
sleep 1

type_slow "echo 'Created by twake-cli demo' > /tmp/demo-file.txt && node bin/twake.js drive upload /tmp/demo-file.txt"
echo 'Created by twake-cli demo' > /tmp/demo-file.txt && node bin/twake.js drive upload /tmp/demo-file.txt
sleep 1

type_slow "node bin/twake.js drive ls"
node bin/twake.js drive ls
sleep 1

# Mail
section "Twake Mail (JMAP Protocol)"
type_slow "node bin/twake.js mail mailboxes"
node bin/twake.js mail mailboxes
sleep 1

# Unified Search
section "Unified Search (across all services)"
type_slow "node bin/twake.js search 'twake-cli'"
node bin/twake.js search 'twake-cli'
sleep 1

echo ""
echo -e "${G}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║          Demo complete!               ║"
echo "  ║   github.com/JacobiusMakes/twake-cli  ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${R}"
