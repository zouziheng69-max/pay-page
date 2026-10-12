import base64,pathlib,sys
F=str(pathlib.Path(__file__).parent/'src/fonts')+'/'
b=lambda p: base64.b64encode(open(F+p,'rb').read()).decode()
s=pathlib.Path('src/template.html').read_text()
s=s.replace('%%BEBAS%%',b('bebas-neue-latin-400-normal.woff2'))
s=s.replace('%%BODONI%%',b('bodoni-moda-latin-500-normal.woff2'))
s=s.replace('%%BODONI_I%%',b('bodoni-moda-latin-500-italic.woff2'))
pathlib.Path('index.html').write_text(s); print(len(s)//1024,'KB')
