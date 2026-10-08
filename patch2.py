import re

with open('ui/src/components/RestorationSettings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

imports = '''import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Checkbox } from "./ui/checkbox"
'''
content = content.replace("import { Input } from './ui/input'", imports + "import { Input } from './ui/input'")

with open('ui/src/components/RestorationSettings.tsx', 'w', encoding='utf-8') as f:
    f.write(content)