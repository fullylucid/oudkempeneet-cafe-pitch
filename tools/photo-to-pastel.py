#!/usr/bin/env python3
# photo-to-pastel — assets/terrace.webp → ordering/site/terrace-pastel.webp: the original photo with a
# soft cartoon/pastel treatment (smoothed, posterised colour regions, a hint of edge), the palette skewed
# toward the page's cream, faded to blend, and an alpha vignette so every edge dissolves into the page.
# Usage: python3 tools/photo-to-pastel.py [src] [dst]
import sys, os, numpy as np
from PIL import Image, ImageFilter, ImageEnhance
src=sys.argv[1] if len(sys.argv)>1 else 'assets/terrace.webp'
dst=sys.argv[2] if len(sys.argv)>2 else 'ordering/site/terrace-pastel.webp'
CREAM=(246,239,225)               # between --field #F1EADC and --paper #FBF7EF
im=Image.open(src).convert('RGB'); W,H=im.size
# 1. cartoon: smooth the texture, posterise into flat colour regions, soften the steps
flat=im.filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.SMOOTH)
flat=flat.quantize(28,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB').filter(ImageFilter.GaussianBlur(0.8))
# 2. pastel: lift, flatten contrast, calm the colour
pastel=ImageEnhance.Contrast(flat).enhance(0.78)
pastel=ImageEnhance.Brightness(pastel).enhance(1.10)
pastel=ImageEnhance.Color(pastel).enhance(0.95)
# 3. skew toward the page cream
pastel=Image.blend(pastel,Image.new('RGB',(W,H),CREAM),0.38)
# 4. a hint of edge so it reads 'drawn': dark edges at low weight, from the smoothed image
g=np.asarray(flat.convert('L'),np.float32)
kx=np.array([[-1,0,1],[-2,0,2],[-1,0,1]],np.float32); ky=kx.T
def conv(a,k):
    p=np.pad(a,1,mode='edge'); out=np.zeros_like(a)
    for i in range(3):
        for j in range(3): out+=k[i,j]*p[i:i+H,j:j+W]
    return out
mag=np.hypot(conv(g,kx),conv(g,ky)); e=np.clip((mag-40)/160,0,1)*0.22
rgb=np.asarray(pastel,np.float32)
rgb=rgb*(1-e[...,None])+np.array([94,66,40],np.float32)*e[...,None]
# 5. alpha: overall fade + a superellipse vignette that reaches zero at every edge
yy,xx=np.mgrid[0:H,0:W]; nx=np.abs(xx-(W-1)/2)/((W-1)/2); ny=np.abs(yy-(H-1)/2)/((H-1)/2)
t=(nx**3+ny**3)**(1/3)                      # 0 at centre → 1 at the edge, rounded-rectangle isolines
fade=np.clip((1.0-t)/0.48,0,1); fade=fade*fade*(3-2*fade)     # smoothstep over the outer ~48%
alpha=(0.78*fade*255).astype(np.uint8)
out=np.dstack([np.clip(rgb,0,255).astype(np.uint8),alpha])
Image.fromarray(out,'RGBA').save(dst,quality=84,method=6)
print(dst,W,'x',H,'bytes',os.path.getsize(dst))
