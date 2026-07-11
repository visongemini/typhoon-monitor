#!/bin/bash
# 双击启动台风监控站
cd "$(dirname "$0")"
if ! lsof -i :8737 >/dev/null 2>&1; then
  nohup node server.js > /tmp/typhoon-monitor.log 2>&1 &
  sleep 1
fi
open "http://localhost:8737"
