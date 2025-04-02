#!/bin/bash

# Create log and pid directories
mkdir -p logs
mkdir -p .pids

# Color codes for different services
SYS_COLOR="\033[0;31m"        # Red
API_COLOR="\033[0;32m"        # Green
LLM_COLOR="\033[0;34m"        # Blue
EMBEDDINGS_COLOR="\033[0;35m" # Purple
RESET_COLOR="\033[0m"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# PID file paths
PID_DIR=".pids"
API_PID_FILE="$PID_DIR/api.pid"
LLM_PID_FILE="$PID_DIR/llm.pid"
EMBEDDINGS_PID_FILE="$PID_DIR/embeddings.pid"

# Function to check if a port is in use
check_port() {
  local port=$1
  local in_use=$(lsof -i:$port -t 2>/dev/null)
  if [ ! -z "$in_use" ]; then
    return 0 # Port is in use
  else
    return 1 # Port is free
  fi
}

# Function to kill process using a specific port
kill_port() {
  local port=$1
  local pid=$(lsof -i:$port -t 2>/dev/null)
  if [ ! -z "$pid" ]; then
    echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Killing process on port $port (PID: $pid)..."
    kill -9 $pid 2>/dev/null
    return 0
  else
    echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} No process found on port $port."
    return 1
  fi
}

# Function to cleanup ports
cleanup_ports() {
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Cleaning up ports..."
  kill_port 3000 # API port
  kill_port 3001 # LLM port
  kill_port 3002 # Embeddings port
}

# Function to cleanup log files
cleanup_logs() {
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Cleaning up old log files..."
  rm -f logs/api_*.log
  rm -f logs/llm_*.log
  rm -f logs/embeddings_*.log
}

# Function to cleanup PID files
cleanup_pid_files() {
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Cleaning up PID files..."
  rm -f $API_PID_FILE
  rm -f $LLM_PID_FILE
  rm -f $EMBEDDINGS_PID_FILE
}

# Function to check if a process is still running from PID file
check_pid_file() {
  local pid_file=$1
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Process with PID $pid is still running."
      return 0
    else
      echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Process from PID file $pid_file is not running."
      rm -f "$pid_file"
    fi
  fi
  return 1
}

# Function to kill processes from PID files
kill_from_pid_files() {
  if [ -f "$API_PID_FILE" ]; then
    local pid=$(cat "$API_PID_FILE")
    echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Killing API process (PID: $pid)..."
    kill -9 $pid 2>/dev/null
    rm -f "$API_PID_FILE"
  fi

  if [ -f "$LLM_PID_FILE" ]; then
    local pid=$(cat "$LLM_PID_FILE")
    echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Killing LLM process (PID: $pid)..."
    kill -9 $pid 2>/dev/null
    rm -f "$LLM_PID_FILE"
  fi

  if [ -f "$EMBEDDINGS_PID_FILE" ]; then
    local pid=$(cat "$EMBEDDINGS_PID_FILE")
    echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Killing Embeddings process (PID: $pid)..."
    kill -9 $pid 2>/dev/null
    rm -f "$EMBEDDINGS_PID_FILE"
  fi
}

# Function to cleanup processes on exit
cleanup() {
  # Print a newline first to ensure clean output after ^C
  echo ""
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Shutting down services..."
  # Kill all background processes
  if [ ! -z "$API_PID" ]; then
    kill $API_PID 2>/dev/null
    rm -f "$API_PID_FILE"
  fi
  if [ ! -z "$LLM_PID" ]; then
    kill $LLM_PID 2>/dev/null
    rm -f "$LLM_PID_FILE"
  fi
  if [ ! -z "$EMBEDDINGS_PID" ]; then
    kill $EMBEDDINGS_PID 2>/dev/null
    rm -f "$EMBEDDINGS_PID_FILE"
  fi

  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Log files saved to:"
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} - API: $API_LOG"
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} - LLM: $LLM_LOG"
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} - EMB: $EMBEDDINGS_LOG"

  exit 0
}

# Set trap for SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

# Check for command-line arguments
CLEANUP_ONLY=0
for arg in "$@"; do
  case $arg in
  --cleanup)
    CLEANUP_ONLY=1
    ;;
  --help)
    echo "Usage: $0 [options]"
    echo "Options:"
    echo "  --cleanup    Clean up existing processes on ports 3000, 3001, 3002 and exit"
    echo "  --help       Show this help message"
    exit 0
    ;;
  esac
done

# If cleanup-only mode is activated, just clean up and exit
if [ $CLEANUP_ONLY -eq 1 ]; then
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Running in cleanup-only mode."
  # Check for processes from PID files first
  kill_from_pid_files
  # Then check for any processes on the ports
  cleanup_ports
  # Clean up PID files
  cleanup_pid_files
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Cleanup completed."
  exit 0
fi

# Check for existing processes before starting
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Checking for existing processes..."

# First check PID files
if check_pid_file "$API_PID_FILE" || check_pid_file "$LLM_PID_FILE" || check_pid_file "$EMBEDDINGS_PID_FILE"; then
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Found running processes from previous session."
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Would you like to kill these processes? (y/n): "
  read -p "" kill_choice
  if [[ "$kill_choice" == "y" || "$kill_choice" == "Y" ]]; then
    kill_from_pid_files
  else
    echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Exiting without starting new processes."
    exit 1
  fi
fi

# Then check ports
if check_port 3000 || check_port 3001 || check_port 3002; then
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Some ports (3000, 3001, or 3002) are already in use."
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Would you like to kill processes using these ports? (y/n): "
  read -p "" kill_choice
  if [[ "$kill_choice" == "y" || "$kill_choice" == "Y" ]]; then
    cleanup_ports
  else
    echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Exiting without starting new processes."
    exit 1
  fi
fi

# Set debug flags based on DEBUG environment variable
API_RELOAD_FLAG=""
API_DEBUG_FLAG=""
LLM_DEBUG_FLAG=""
EMBEDDINGS_DEBUG_FLAG=""

# Process DEBUG flag values
if [[ "$DEBUG" == "1" || "$DEBUG" == "True" || "$DEBUG" == "true" || "$DEBUG" == "y" ]]; then
  # DEBUG=1: Add reload flag to API only
  API_RELOAD_FLAG="--reload"
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Debug mode level 1 enabled. API service will use hot reload."
elif [[ "$DEBUG" == "2" ]]; then
  # DEBUG=2: Add reload flag to API and enable additional debug logs for all services
  API_RELOAD_FLAG="--reload"
  API_DEBUG_FLAG="--debug"
  LLM_DEBUG_FLAG="--debug"
  EMBEDDINGS_DEBUG_FLAG="--debug"
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Debug mode level 2 enabled. API service will use hot reload and all services will log debug information."
  # When DEBUG=2, automatically keep logs
  KEEP_LOGS="1"
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Debug mode level 2 automatically preserves old log files."
else
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Debug mode disabled. Services will run without hot reload or additional debugging."
fi

# Clean up old logs by default, unless KEEP_LOGS=1
if [[ "$KEEP_LOGS" != "1" ]]; then
  cleanup_logs
else
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Preserving old log files."
fi

# Create log filenames
API_LOG="logs/api_${TIMESTAMP}.log"
LLM_LOG="logs/llm_${TIMESTAMP}.log"
EMBEDDINGS_LOG="logs/embeddings_${TIMESTAMP}.log"

echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Logs will be saved to:"
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} - API: $API_LOG"
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} - LLM: $LLM_LOG"
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} - Embeddings: $EMBEDDINGS_LOG"

# Start LLM service
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Starting LLM service on port 3001..."
DEBUG=${DEBUG:=0} BENTOML_DISABLE_GPU_ALLOCATION=True CUDA_VISIBLE_DEVICES=1 VLLM_PLUGINS= bentoml serve service:LLM --port 3001 $LLM_DEBUG_FLAG > >(tee -a $LLM_LOG | while read line; do echo -e "${LLM_COLOR}[LLM]${RESET_COLOR} $line"; done) 2>&1 &
LLM_PID=$!
echo $LLM_PID >$LLM_PID_FILE

# Start Embeddings service
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Starting Embeddings service on port 3002..."
DEBUG=${DEBUG:=0} BENTOML_DISABLE_GPU_ALLOCATION=True CUDA_VISIBLE_DEVICES=0 VLLM_PLUGINS= bentoml serve service:Embeddings --port 3002 $EMBEDDINGS_DEBUG_FLAG > >(tee -a $EMBEDDINGS_LOG | while read line; do echo -e "${EMBEDDINGS_COLOR}[EMB]${RESET_COLOR} $line"; done) 2>&1 &
EMBEDDINGS_PID=$!
echo $EMBEDDINGS_PID >$EMBEDDINGS_PID_FILE

# Start API service
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Starting API service on port 3000..."
DEBUG=${DEBUG:=0} DEVELOPMENT=1 VLLM_PLUGINS= bentoml serve service:API --port 3000 $API_DEBUG_FLAG $API_RELOAD_FLAG > >(tee -a $API_LOG | while read line; do echo -e "${API_COLOR}[API]${RESET_COLOR} $line"; done) 2>&1 &
API_PID=$!
echo $API_PID >$API_PID_FILE

# Check if processes are running
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Checking if processes started correctly..."
sleep 2
if ! kill -0 $API_PID 2>/dev/null; then
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} API service failed to start!"
  rm -f $API_PID_FILE
fi
if ! kill -0 $LLM_PID 2>/dev/null; then
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} LLM service failed to start!"
  rm -f $LLM_PID_FILE
fi
if ! kill -0 $EMBEDDINGS_PID 2>/dev/null; then
  echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} Embeddings service failed to start!"
  rm -f $EMBEDDINGS_PID_FILE
fi

echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} All services started. Press Ctrl+C to stop all services."
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} If SSH disconnects, run '$0 --cleanup' after reconnecting to clean up processes."

# Clear the ^C from the screen when it appears
trap 'echo -e "\r\033[K"' INT

# Wait for all processes to finish
# This keeps the script running until manually terminated or all processes exit
wait $API_PID $LLM_PID $EMBEDDINGS_PID

# If we get here, it means the processes have exited
echo -e "${SYS_COLOR}[SYS]${RESET_COLOR} All services have stopped."
