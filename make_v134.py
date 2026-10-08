from pathlib import Path
import re, zipfile, shutil

root=Path('/mnt/data/v134work')
idx=root/'public/index.html'
cla=root/'public/classic.html'

new_hero=r'''<!-- V134: reference-faithful faceted crystal — broad crown, deep facets, glass-like dimensionality -->
<g class="csa-hero134" stroke-linejoin="round" stroke-linecap="round" pointer-events="none">
  <!-- deep rear body: gives the crystal a physical silhouette without a black cutout -->
  <polygon points="60,16 91,60 60,105 29,60" fill="#02070d" fill-opacity=".92" stroke="#0b568d" stroke-opacity=".38" stroke-width=".62"/>
  <polygon points="60,20 86,60 60,100 34,60" fill="#061321" fill-opacity=".54" stroke="#126da7" stroke-opacity=".22" stroke-width=".46"/>

  <!-- main crown: split into real faceted planes rather than four flat triangles -->
  <g class="csa-crown134">
    <!-- upper left shoulder planes -->
    <polygon points="60,18 48,39 32,60 60,60" fill="url(#v134-darkleft)" stroke="#3dafff" stroke-opacity=".72" stroke-width=".82"/>
    <polygon points="60,18 48,39 60,60" fill="url(#v134-silverleft)" stroke="#dff7ff" stroke-opacity=".58" stroke-width=".54"/>
    <polygon points="48,39 32,60 60,60" fill="#071827" fill-opacity=".88" stroke="#208ed3" stroke-opacity=".58" stroke-width=".50"/>
    <!-- upper right shoulder planes -->
    <polygon points="60,18 72,39 88,60 60,60" fill="url(#v134-darkright)" stroke="#3dafff" stroke-opacity=".72" stroke-width=".82"/>
    <polygon points="60,18 72,39 60,60" fill="url(#v134-silverright)" stroke="#f0fbff" stroke-opacity=".66" stroke-width=".54"/>
    <polygon points="72,39 88,60 60,60" fill="#081b2c" fill-opacity=".88" stroke="#208ed3" stroke-opacity=".58" stroke-width=".50"/>

    <!-- lower left planes: longer and darker, creating depth -->
    <polygon points="32,60 48,68 60,102 60,60" fill="url(#v134-lowerleft)" stroke="#178bd0" stroke-opacity=".66" stroke-width=".76"/>
    <polygon points="48,68 60,60 60,102" fill="#06111c" fill-opacity=".94" stroke="#42b4ff" stroke-opacity=".46" stroke-width=".50"/>
    <polygon points="32,60 48,68 60,60" fill="#0a2134" fill-opacity=".84" stroke="#bfeaff" stroke-opacity=".30" stroke-width=".42"/>
    <!-- lower right planes -->
    <polygon points="88,60 72,68 60,102 60,60" fill="url(#v134-lowerright)" stroke="#178bd0" stroke-opacity=".66" stroke-width=".76"/>
    <polygon points="72,68 60,60 60,102" fill="#07131f" fill-opacity=".94" stroke="#42b4ff" stroke-opacity=".46" stroke-width=".50"/>
    <polygon points="88,60 72,68 60,60" fill="#0a2134" fill-opacity=".82" stroke="#d7f4ff" stroke-opacity=".27" stroke-width=".42"/>
  </g>

  <!-- internal nested crystal: visibly recessed, like a second piece of glass inside -->
  <g class="csa-inner134">
    <polygon points="60,31 79,60 60,89 41,60" fill="#01050a" fill-opacity=".88" stroke="#168fe8" stroke-opacity=".62" stroke-width=".70"/>
    <polygon points="60,31 70,46 60,60 50,46" fill="url(#v134-innerTop)" stroke="#bfeaff" stroke-opacity=".40" stroke-width=".42"/>
    <polygon points="60,31 50,46 41,60 60,60" fill="#061321" fill-opacity=".72" stroke="#4db9ff" stroke-opacity=".34" stroke-width=".40"/>
    <polygon points="60,31 70,46 79,60 60,60" fill="#0a1d30" fill-opacity=".70" stroke="#69c7ff" stroke-opacity=".38" stroke-width=".40"/>
    <polygon points="41,60 50,67 60,89 60,60" fill="#030b13" stroke="#168fe8" stroke-opacity=".34" stroke-width=".42"/>
    <polygon points="79,60 70,67 60,89 60,60" fill="#06111b" stroke="#168fe8" stroke-opacity=".34" stroke-width=".42"/>
    <path d="M60 31V89M41 60H79M50 46L60 60L70 46M50 67L60 60L70 67" fill="none" stroke="#38aaff" stroke-opacity=".34" stroke-width=".42"/>
  </g>

  <!-- razor facets: the white/blue flashes that make the reference look like cut glass -->
  <g class="csa-facets134" fill="none">
    <path d="M60 18L48 39L60 60L72 39Z" stroke="#f1fbff" stroke-opacity=".66" stroke-width=".52"/>
    <path d="M32 60L48 39L60 60L48 68Z" stroke="#dff7ff" stroke-opacity=".42" stroke-width=".42"/>
    <path d="M88 60L72 39L60 60L72 68Z" stroke="#dff7ff" stroke-opacity=".46" stroke-width=".42"/>
    <path d="M32 60L48 68L60 102" stroke="#58bcff" stroke-opacity=".54" stroke-width=".52"/>
    <path d="M88 60L72 68L60 102" stroke="#58bcff" stroke-opacity=".54" stroke-width=".52"/>
    <path d="M60 18L60 102" stroke="#dff7ff" stroke-opacity=".28" stroke-width=".42"/>
  </g>

  <!-- small angular reflections, deliberately asymmetrical so it reads as a physical object -->
  <g class="csa-specular134">
    <path d="M60 20L51 38L56 36L64 22Z" fill="#ffffff" fill-opacity=".16"/>
    <path d="M35 59L48 45L45 55L38 63Z" fill="#aee4ff" fill-opacity=".10"/>
    <path d="M85 58L72 43L76 54L82 63Z" fill="#e5f9ff" fill-opacity=".12"/>
    <path d="M57 96L50 74L55 78L62 98Z" fill="#69c7ff" fill-opacity=".09"/>
  </g>
</g>
'''

# New gradients inserted before existing defs close.
gradients=r'''<linearGradient id="v134-darkleft" x1="20" y1="35" x2="60" y2="70">
 <stop offset="0" stop-color="#102b43"/><stop offset=".38" stop-color="#071725"/><stop offset=".78" stop-color="#02070d"/><stop offset="1" stop-color="#000204"/>
</linearGradient>
<linearGradient id="v134-darkright" x1="100" y1="35" x2="60" y2="70">
 <stop offset="0" stop-color="#173b59"/><stop offset=".34" stop-color="#091b2c"/><stop offset=".78" stop-color="#02070d"/><stop offset="1" stop-color="#000204"/>
</linearGradient>
<linearGradient id="v134-silverleft" x1="48" y1="22" x2="60" y2="58">
 <stop offset="0" stop-color="#dff7ff" stop-opacity=".52"/><stop offset=".28" stop-color="#78c8ff" stop-opacity=".26"/><stop offset=".72" stop-color="#0d3e65" stop-opacity=".18"/><stop offset="1" stop-color="#000204" stop-opacity=".05"/>
</linearGradient>
<linearGradient id="v134-silverright" x1="72" y1="22" x2="60" y2="58">
 <stop offset="0" stop-color="#f3fbff" stop-opacity=".60"/><stop offset=".30" stop-color="#75c7ff" stop-opacity=".28"/><stop offset=".72" stop-color="#0c3b61" stop-opacity=".18"/><stop offset="1" stop-color="#000204" stop-opacity=".05"/>
</linearGradient>
<linearGradient id="v134-lowerleft" x1="35" y1="60" x2="60" y2="103">
 <stop offset="0" stop-color="#0c263b"/><stop offset=".30" stop-color="#071725"/><stop offset=".70" stop-color="#02070d"/><stop offset="1" stop-color="#000204"/>
</linearGradient>
<linearGradient id="v134-lowerright" x1="85" y1="60" x2="60" y2="103">
 <stop offset="0" stop-color="#10314b"/><stop offset=".30" stop-color="#081a29"/><stop offset=".70" stop-color="#02070d"/><stop offset="1" stop-color="#000204"/>
</linearGradient>
<linearGradient id="v134-innerTop" x1="60" y1="31" x2="60" y2="60">
 <stop offset="0" stop-color="#6bbfff" stop-opacity=".26"/><stop offset=".42" stop-color="#0c3554" stop-opacity=".24"/><stop offset="1" stop-color="#000204" stop-opacity=".10"/>
</linearGradient>
'''


def patch(path):
    s=path.read_text(encoding='utf-8')
    # Insert gradients before </defs> in the first logo only.
    marker='</defs>'
    pos=s.find(marker, s.find('<svg class="csk-logo'))
    if pos<0: raise RuntimeError(f'no defs in {path}')
    s=s[:pos]+gradients+s[pos:]
    start=s.find('<!-- hero crystal -->', pos)
    end=s.find('<!-- V130: black mirror-glass facets', start)
    if start<0 or end<0: raise RuntimeError(f'hero section not found {path}')
    s=s[:start]+new_hero+s[end:]
    path.write_text(s, encoding='utf-8')

patch(idx); patch(cla)

# README
(root/'README-v134.txt').write_text('v134 — reference-faithful faceted crystal. Rebuilt the core crystal geometry to match the supplied target: broad triangular crown, layered cut-glass facets, recessed inner crystal, directional reflections, and dimensional dark-blue/black glass. index.html and classic.html share the same crystal SVG.\n', encoding='utf-8')

out=Path('/mnt/data/crypto-schedule-v134-faceted-reference.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if p.is_file(): z.write(p,p.relative_to(root))
print(out, out.stat().st_size)
