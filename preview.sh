#!/usr/bin/env bash

# ANSI Color Codes for Premium Look
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD}${PURPLE}          🎮 DECENTRALAND SDK7 WSL2 PREVIEW LAUNCHER 🎮          ${NC}"
echo -e "${CYAN}================================================================${NC}"

# Detect WSL IP or Mirrored mode
WSL_CONFIG="/mnt/c/Users/perez/.wslconfig"
if [ -f "$WSL_CONFIG" ] && grep -q "networkingMode=mirrored" "$WSL_CONFIG"; then
    IP="localhost"
    echo -e "${GREEN}[✓] Mirrored Networking Mode Detected! Using localhost.${NC}"
else
    IP=$(hostname -I | awk '{print $1}')
fi

if [ -z "$IP" ]; then
    echo -e "${YELLOW}[!] Warning: Could not auto-detect WSL IP. Defaulting to localhost.${NC}"
    IP="localhost"
fi

PORT=8000
POSITION="-134,-9"

# Construct URLs
BROWSER_URL="http://${IP}:${PORT}/?ws=ws%3A%2F%2F${IP}%3A${PORT}%2F%7E%2Fws"
DECODED_CLIENT_URL="decentraland://realm=http://${IP}:${PORT}&position=${POSITION}&dclenv=org&local-scene=true"

echo -e "${GREEN}[✓] Connection Address:${NC} ${BOLD}${IP}:${PORT}${NC}"
echo -e ""
echo -e "${BOLD}1. Browser Preview Link:${NC}"
echo -e "   ${CYAN}${BROWSER_URL}${NC}"
echo -e ""
echo -e "${BOLD}2. Desktop Client Link / Win+R Command:${NC}"
echo -e "   ${CYAN}${DECODED_CLIENT_URL}${NC}"
echo -e ""
echo -e "${CYAN}----------------------------------------------------------------${NC}"
echo -e "${BOLD}Attempting to launch the Desktop Client directly in Windows...${NC}"

# Launch on Windows using powershell.exe (much more robust than cmd.exe for ampersands!)
if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -Command "Start-Process '${DECODED_CLIENT_URL}'" 2>/dev/null
    echo -e "${GREEN}[✓] Desktop Client launched successfully in Windows!${NC}"
elif command -v cmd.exe >/dev/null 2>&1; then
    # Fallback to cmd.exe if powershell is not found
    cmd.exe /c start "" "${DECODED_CLIENT_URL}" 2>/dev/null
    echo -e "${GREEN}[✓] Desktop Client launch command sent to Windows!${NC}"
else
    echo -e "${YELLOW}[!] Note: Could not auto-launch in Windows (no powershell.exe or cmd.exe found). Please copy the link above.${NC}"
fi
echo -e "${CYAN}================================================================${NC}"
