#!/usr/bin/env python3
"""Run after changing any CSS or JS file: stamps each page's <script>/<link> with a
fingerprint of the file, so visitors' browsers fetch the new version immediately.
Usage: python3 scripts/bump-assets.py"""
import glob, hashlib, os, re
root = os.path.join(os.path.dirname(__file__), '..', 'public')
assets = [p[len(root):].replace(os.sep, '/') for p in glob.glob(root + '/assets/**/*.*', recursive=True) if p.endswith(('.css', '.js'))]
ver = {a: hashlib.sha1(open(root + a, 'rb').read()).hexdigest()[:8] for a in assets}
for page in glob.glob(root + '/**/*.html', recursive=True):
    s = o = open(page).read()
    for a, v in ver.items():
        s = re.sub(re.escape(a) + r'(\?v=\w+)?(?=")', a + '?v=' + v, s)
    if s != o:
        open(page, 'w').write(s); print('updated', page[len(root):])
