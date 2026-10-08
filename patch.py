import re

with open('ui/src/components/RestorationSettings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports
imports = '''import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Checkbox } from "./ui/checkbox"
'''
content = content.replace('import { Input } from "./ui/input"', imports + 'import { Input } from "./ui/input"')

# Replace selects
# <select value={deinterlacer} onChange={(e) => setDeinterlacer(e.target.value as any)}
# className="...">
#   <option value="bwdif">BWDIF (Rápido / CPU Leve)</option>
#   ...
# </select>

def replace_select(m):
    val = m.group(1)
    setter = m.group(2)
    options_html = m.group(3)
    
    # parse options
    opts = []
    for opt in re.finditer(r'<option value="([^"]+)">([^<]+)</option>', options_html):
        opts.append(f'<SelectItem value="{opt.group(1)}">{opt.group(2)}</SelectItem>')
    
    opts_str = chr(10).join(opts)
    
    return f'''<Select value={{{val}}} onValueChange={{(val) => {setter}(val as any)}}>
  <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-white">
    <SelectValue placeholder="Selecione..." />
  </SelectTrigger>
  <SelectContent>
    {opts_str}
  </SelectContent>
</Select>'''

content = re.sub(
    r'<select value=\{([^}]+)\} onChange=\{\(e\) => ([^(]+)\(e\.target\.value as any\)\}[^>]+>(.*?)</select>',
    replace_select,
    content,
    flags=re.DOTALL
)

with open('ui/src/components/RestorationSettings.tsx', 'w', encoding='utf-8') as f:
    f.write(content)