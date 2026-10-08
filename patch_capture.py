import re

with open('ui/src/components/CaptureBar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("import { Play, Square, Settings2, ShieldCheck, Database, HardDrive, RefreshCw } from 'lucide-react'", 
"import { Play, Square, Settings2, ShieldCheck, Database, HardDrive, RefreshCw } from 'lucide-react'\nimport { Button } from './ui/button'")

content = content.replace("<button", "<Button")
content = content.replace("</button>", "</Button>")

with open('ui/src/components/CaptureBar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)