# Demo recording script for https://github.com/charmbracelet/vhs
#   vhs docs/demo.tape   ->   docs/demo.gif
#
# Assumes `npm run build && npm link` and ANTHROPIC_API_KEY in .env.

Output docs/demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 1100
Set Height 750
Set Padding 16
Set Theme "Catppuccin Mocha"

Type "commit-critic --analyze"
Enter
Sleep 12s

Type "q"
Sleep 500ms

Ctrl+L
Type "echo 'export const X = 1;' >> src/format.ts && git add src/format.ts"
Enter
Sleep 500ms

Type "commit-critic --write"
Enter
Sleep 10s
Enter
Sleep 3s
