#!/usr/bin/env python3
"""Pin only existing browser Supabase CDN references to the reviewed local UMD."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parent.parent
TARGET = '/vendor/supabase-2.119.0.js'
OLD = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2']
changed = []
for p in sorted([*ROOT.glob('*.html'), *ROOT.glob('*.js')]):
    text = p.read_text()
    pinned = text
    for url in OLD:
        pinned = pinned.replace(url, TARGET)
    if p.name == 'index.html':
        tag = '<script src="' + TARGET + '"></script>'
        if pinned.count(tag) > 1:
            first = pinned.find(tag)
            pinned = pinned[:first+len(tag)] + pinned[first+len(tag):].replace(tag, '')
        pinned = re.sub(r'(?m)^[ \t]+$', '', pinned)
    if pinned != text:
        p.write_text(pinned)
        changed.append(p.name)
print('Pinned browser files:', ', '.join(changed))
