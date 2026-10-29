#!/bin/sh
# Read-only: shows how the website is run on this server (it changes nothing). Paste the whole output back.
# Run:  sh diagnose.sh      (or copy the commands below by hand)

echo "== who/where"; hostname; date; echo "user: $(id -un)"
echo; echo "== node / npm"; node -v 2>&1; npm -v 2>&1
echo; echo "== processes that look like the site"
ps -eo pid,user,etime,args | grep -i -E 'next|node ' | grep -v grep | head -10
echo; echo "== folder of the Next.js process (current directory)"
for pid in $(pgrep -f 'next-server|next start|next/dist' 2>/dev/null | head -5); do
  echo "pid $pid -> $(readlink -f /proc/$pid/cwd 2>/dev/null)"
done
echo; echo "== pm2"; (command -v pm2 >/dev/null 2>&1 && pm2 list 2>&1 | head -15) || echo "pm2 not installed"
echo; echo "== systemd services mentioning canteen/next/node"
systemctl list-units --type=service --no-legend 2>/dev/null | grep -i -E 'canteen|next|node|hmu' | head
echo; echo "== docker"; (command -v docker >/dev/null 2>&1 && docker ps 2>&1 | head -8) || echo "docker not installed"
echo; echo "== nginx sites"
grep -rn -E 'server_name|proxy_pass|root ' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -12
echo; echo "== common project folders"
ls -d /opt/* /var/www/* /srv/* /home/*/* 2>/dev/null | grep -i -E 'canteen|hmu|app' | head
echo; echo "== git state of the project (if found above)"
for d in /opt/canteen /var/www/canteen /srv/canteen "$(pwd)"; do
  [ -d "$d/.git" ] && { echo "$d: $(git -C "$d" log --oneline -1 2>/dev/null)"; }
done
