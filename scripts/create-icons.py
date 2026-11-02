from PIL import Image, ImageDraw
from pathlib import Path

target = Path('public')
for size, name, mask in [(192,'icon-192.png',False),(512,'icon-512.png',False),(512,'icon-maskable.png',True)]:
    im=Image.new('RGB',(512,512),'#173e32')
    d=ImageDraw.Draw(im)
    offset=36 if mask else 0
    def xy(points):
        return [(offset+x*(512-2*offset)/512,offset+y*(512-2*offset)/512) for x,y in points]
    d.line(xy([(150,170),(330,170),(362,202),(362,342),(182,342),(150,310),(150,170)]),fill='#e0efbb',width=23)
    d.polygon(xy([(256,108),(214,234),(288,234),(248,366),(353,207),(276,207),(315,108)]),fill='#e0efbb')
    im.resize((size,size),Image.Resampling.LANCZOS).save(target/name)
print('PWA icons created.')
