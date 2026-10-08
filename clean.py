with open('ui/src/components/Header.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with open('ui/src/components/Header.tsx', 'w', encoding='utf-8') as f:
    for line in lines:
        if 'import { Button } from "./ui/button";' in line:
            pass # Remove it
        else:
            f.write(line)

with open('ui/src/components/RestorationSettings.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with open('ui/src/components/RestorationSettings.tsx', 'w', encoding='utf-8') as f:
    for line in lines:
        if 'import { Checkbox }' in line:
            pass
        else:
            f.write(line)