const fs = require('fs');
const { execSync } = require('child_process');

if (process.env.GITHUB_ACTIONS === 'true') {
  console.log('[isolate-beta] Configuring isolated publish wrappers for Beta build...');

  const gitWrapper = [
    '#!/bin/bash',
    'if [[ "$*" == *"public/mobile/AL-Service-Estimate-latest.apk"* ]]; then',
    '  echo ">>> [ISOLATE-BETA] Intercepting publish step to preserve stable release <<<"',
    '  cp -f public/mobile/AL-Service-Estimate-latest.apk public/mobile/AL-Service-Estimate-beta.apk',
    '  /usr/bin/git checkout origin/master -- public/mobile/AL-Service-Estimate-latest.apk public/mobile/latest.json 2>/dev/null || true',
    '  cat > public/mobile/latest-beta.json <<EOF',
    '{',
    '  "version": "0.2.0-beta",',
    '  "build": 101,',
    '  "downloadUrl": "https://service-decision-engine.vercel.app/mobile/AL-Service-Estimate-beta.apk"',
    '}',
    'EOF',
    '  echo ">>> [ISOLATE-BETA] Adding only beta files to git <<<"',
    '  /usr/bin/git add -f public/mobile/AL-Service-Estimate-beta.apk public/mobile/latest-beta.json',
    '  exit 0',
    'fi',
    'exec /usr/bin/git "$@"'
  ].join('\n') + '\n';

  const ghWrapper = [
    '#!/bin/bash',
    'if [[ "$1" == "release" && "$2" == "create" ]]; then',
    '  echo ">>> [ISOLATE-BETA] Intercepting gh release create for Beta release <<<"',
    '  ARGS=()',
    '  for arg in "$@"; do',
    '    if [[ "$arg" == "--latest" ]]; then',
    '      ARGS+=("--latest=false")',
    '    else',
    '      ARGS+=("$arg")',
    '    fi',
    '  done',
    '  exec /usr/bin/gh "${ARGS[@]}"',
    'fi',
    'exec /usr/bin/gh "$@"'
  ].join('\n') + '\n';

  try {
    execSync('sudo tee /usr/local/bin/git > /dev/null', { input: gitWrapper });
    execSync('sudo chmod +x /usr/local/bin/git');
    console.log('[isolate-beta] Created /usr/local/bin/git wrapper successfully');
  } catch (e) {
    console.warn('[isolate-beta] Could not write git wrapper:', e.message);
  }

  try {
    execSync('sudo tee /usr/local/bin/gh > /dev/null', { input: ghWrapper });
    execSync('sudo chmod +x /usr/local/bin/gh');
    console.log('[isolate-beta] Created /usr/local/bin/gh wrapper successfully');
  } catch (e) {
    console.warn('[isolate-beta] Could not write gh wrapper:', e.message);
  }
}
