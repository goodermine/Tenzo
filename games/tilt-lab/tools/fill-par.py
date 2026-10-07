"""Give every level without a par its suggested one (solution time + 15%,
rounded up to half a second), straight from `npm run solve -- --write-par`.
    python3 tools/fill-par.py"""
import glob, re, subprocess
out = subprocess.run(['npm', 'run', '-s', 'solve', '--', '--write-par'], capture_output=True, text=True).stdout
pars = dict(re.findall(r'^\S+ (\S+)\s+solution \S+\s+par (\S+)', out, re.M))
for f in sorted(glob.glob('src/levels/data/world*.ts')):
    s = open(f).read()
    def add(m):
        nxt = s[m.end():m.end() + 30]
        return m.group(0) if nxt.lstrip().startswith("par:") or m.group(1) not in pars else m.group(0) + f"\n  par: {pars[m.group(1)]},"
    t = re.sub(r"  id: '([^']+)',", add, s)
    if t != s: open(f, 'w').write(t); print('pars added in', f)
