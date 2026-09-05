#!/usr/bin/env python3
# photo-to-lines — assets/terrace.webp → ordering/site/terrace-lines.webp: the photo filtered into
# faint coloured lines (edge magnitude → alpha; line colour = the photo's own colour, saturated).
# Not a redrawing: every line is an edge of the original image. Usage: python3 tools/photo-to-lines.py [src] [dst]
import sys, numpy as np
from PIL import Image, ImageFilter, ImageEnhance
src=sys.argv[1] if len(sys.argv)>1 else 'assets/terrace.webp'
dst=sys.argv[2] if len(sys.argv)>2 else 'ordering/site/terrace-lines.webp'
im=Image.open(src).convert('RGB')
W,H=im.size
g=np.asarray(im.filter(ImageFilter.GaussianBlur(1.1)).convert('L'),dtype=np.float32)
# Sobel gradient magnitude
kx=np.array([[-1,0,1],[-2,0,2],[-1,0,1]],np.float32); ky=kx.T
def conv(a,k):
    p=np.pad(a,1,mode='edge'); out=np.zeros_like(a)
    for i in range(3):
        for j in range(3): out+=k[i,j]*p[i:i+H,j:j+W]
    return out
mag=np.hypot(conv(g,kx),conv(g,ky))
# soften foliage noise: suppress edges where local texture is very dense (many edges in a 9px window)
dens=np.asarray(Image.fromarray(np.clip(mag/2,0,255).astype(np.uint8)).filter(ImageFilter.BoxBlur(6)),np.float32)
mag=mag*np.clip(1.15-dens/110.0,0.35,1.0)
# normalise: strongest ~10% of pixels become lines
lo,hi=np.percentile(mag,88),np.percentile(mag,99.3)
a=np.clip((mag-lo)/(hi-lo+1e-6),0,1)**0.85
# thin a little by keeping local maxima along the gradient direction (cheap non-max via max-filter)
mx=np.asarray(Image.fromarray((a*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)),np.float32)/255.0
a=np.where(a>=mx-0.02,a,a*0.35)
# colour: the photo's own colour, saturated and darkened, so lines read as roof-red, umbrella-pink, leaf-green
col=ImageEnhance.Color(im.filter(ImageFilter.GaussianBlur(2))).enhance(2.8)
col=ImageEnhance.Brightness(col).enhance(0.86)
rgb=np.asarray(col,np.uint8)
alpha=(a*255*0.95).astype(np.uint8)
out=np.dstack([rgb,alpha])
Image.fromarray(out,'RGBA').save(dst,quality=82,method=6)
print(dst, W,'x',H, 'lines px', int((alpha>40).sum()), 'bytes', __import__('os').path.getsize(dst))
