import re

with open('ui/src/components/PresetSelector.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("import { Clock, Disc, Sparkles, Youtube } from 'lucide-react'", 
"import { Clock, Disc, Sparkles, Youtube } from 'lucide-react'\nimport { Button } from './ui/button'")

content = content.replace("<button", "<Button variant=\"outline\"")
content = content.replace("</button>", "</Button>")

# It already has its own className logic which is fine, but shadcn Button might override background if we aren't careful, so we use variant=outline.
with open('ui/src/components/PresetSelector.tsx', 'w', encoding='utf-8') as f:
    f.write(content)