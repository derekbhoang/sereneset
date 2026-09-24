# Dev Log

A daily record of how SereneSet is being built:

- What I built / changed, why

- What went wrong, fixes

## Structure

```
docs/devlog/
├── README.md       ← you are here
├── _template.md    ← copy this for each new entry
├── 2026-09-23.md
├── 2026-09-24.md
└── ...
```

## Create today's entry

**PowerShell:**
```powershell
$d = Get-Date -Format yyyy-MM-dd; $f = "docs/devlog/$d.md"; if (!(Test-Path $f)) { (Get-Content docs/devlog/_template.md -Raw -Encoding utf8) -replace 'YYYY-MM-DD', $d | Set-Content $f -Encoding utf8 -NoNewline }
```

**Bash / Git Bash:**
```bash
d=$(date +%F); [ -e docs/devlog/$d.md ] || sed "s/YYYY-MM-DD/$d/" docs/devlog/_template.md > docs/devlog/$d.md
```
