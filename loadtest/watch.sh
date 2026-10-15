#!/usr/bin/env bash
# Records what the server machine is doing every 5 seconds while a load test runs.
#   bash loadtest/watch.sh                 (stop with Ctrl+C)
# Writes loadtest/results/server-<time>.csv and prints each line. Needs only standard Linux tools.
set -u
cd "$(dirname "$0")"
mkdir -p results
out="results/server-$(date +%Y%m%d-%H%M%S).csv"
echo "time,cpu_busy_pct,load_1m,mem_used_mb,mem_total_mb,swap_used_mb,app_cpu_pct,app_mem_mb,app_processes,connections_to_3000,top3_cpu" | tee "$out"
trap 'echo; echo "Saved $out"; exit 0' INT TERM
while true; do
  # vmstat's second line is the average over one second; column 15 is idle CPU
  cpu=$(vmstat 1 2 | tail -1 | awk '{print 100-$15}')
  load=$(cut -d' ' -f1 /proc/loadavg)
  read -r mem_used mem_total <<<"$(free -m | awk '/^Mem:/{print $3, $2}')"
  swap=$(free -m | awk '/^Swap:/{print $3}')
  app=$(ps -eo pcpu=,rss=,args= | grep -E "next-server|next start|next/dist" | grep -v grep | awk '{c+=$1; r+=$2; n++} END{printf "%.0f,%.0f,%d", c, r/1024, n}')
  conns=$(ss -tn state established '( sport = :3000 )' 2>/dev/null | tail -n +2 | wc -l)
  # the three busiest processes right now (the face service shows up here if it runs on this machine)
  top3=$(ps -eo comm=,pcpu= --sort=-pcpu | head -3 | awk '{printf "%s:%s ", $1, $2}')
  echo "$(date +%T),$cpu,$load,$mem_used,$mem_total,$swap,${app:-0,0,0},$conns,${top3% }" | tee -a "$out"
  sleep 4
done
