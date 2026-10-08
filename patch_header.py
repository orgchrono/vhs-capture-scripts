import re

with open('ui/src/components/Header.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("import { Cpu, Film, Sparkles, Wrench, Video } from 'lucide-react'", 
"import { Cpu, Film, Sparkles, Wrench, Video } from 'lucide-react'\nimport { Button } from './ui/button'")

content = content.replace("<button", "<Button variant=\"outline\" size=\"sm\"")
content = content.replace("</button>", "</Button>")
content = content.replace("className=\"bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer flex items-center gap-1\"", "className=\"h-6 px-2 text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40\"")

with open('ui/src/components/Header.tsx', 'w', encoding='utf-8') as f:
    f.write(content)