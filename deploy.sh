#!/bin/bash
cd ~/render_deploy

# Bump SW cache
python3 << 'PYEOF'
import re, datetime
with open('sw.js') as f:
    c = f.read()
v = datetime.datetime.now().strftime('%Y%m%d%H%M')
c = re.sub(r"(const CACHE_NAME\s*=\s*['\"])[^'\"]*(['\"])", r"\g<1>sokopulse-" + v + r"\g<2>", c)
with open('sw.js', 'w') as f:
    f.write(c)
print(f"Cache bumped: sokopulse-{v}")
PYEOF

# Commit and push
git add -A
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')"
git push

echo ""
echo "Deployed. Wait 2-3 min for Render, then hard refresh browser (Ctrl+Shift+R)"
echo "On phones: Settings → Apps → SokoPulse → Storage → Clear cache, then reopen"
