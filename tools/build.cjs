'use strict';
// Builds every game into one self-contained HTML file, plus the arcade launcher.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const GAMES=[
  {id:'delve',title:'Delve',tagline:'A first-person roguelike where every monster is a giant letter.',
   parts:['engine/glyph-engine.js','engine/glyph-input.js','engine/glyph-quality.js','games/delve/src/rules.js','games/delve/src/scene.js','games/delve/src/app.js'],shell:'games/delve/src/shell.html'},
  {id:'inkfire',title:'Inkfire',tagline:'A fast-paced first-person arena shooter with procedural glyph sprites.',
   parts:['engine/glyph-engine.js','engine/glyph-input.js','engine/glyph-quality.js','engine/glyph-art.js','games/inkfire/src/art.js','games/inkfire/src/rules.js','games/inkfire/src/scene.js','games/inkfire/src/app.js'],shell:'games/inkfire/src/shell.html'}
];
const EXTERNAL=[
  {id:'next-stop',title:'Next Stop',tagline:'A rural steam railway in coloured letters. Drive, deliver and explore a valley.',href:'https://taan1el.github.io/next-stop/'}
];

function escape(value){return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
function meta({title,description,image,url}){
  return[`<meta name="description" content="${escape(description)}">`,`<meta property="og:type" content="website">`,`<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,...(image?[`<meta property="og:image" content="${escape(image)}">`]:[]),...(url?[`<meta property="og:url" content="${escape(url)}">`]:[]),
    `<meta name="twitter:card" content="summary_large_image">`].join('\n');
}

function buildGame(game,{out=path.join(root,'dist'),siteUrl=''}={}){
  const license=fs.readFileSync(path.join(root,'LICENSE'),'utf8').trim();
  const code=game.parts.map(part=>fs.readFileSync(path.join(root,part),'utf8'));
  if(code.some(source=>source.includes('</script>')))throw new Error(`${game.id}: source contains a closing script tag.`);
  const shell=fs.readFileSync(path.join(root,game.shell),'utf8');
  for(const marker of ['<!--__LICENSE__-->','<!--__META__-->','/*__CODE__*/'])if(!shell.includes(marker))throw new Error(`${game.id}: shell is missing ${marker}`);
  const base=siteUrl.replace(/\/?$/,'/');
  const html=shell.replace('<!--__LICENSE__-->',()=>'<!--\n'+license+'\n-->')
    .replace('<!--__META__-->',()=>meta({title:`${game.title} · Glyph Arcade`,description:game.tagline,image:siteUrl?`${base}previews/${game.id}.png`:'',url:siteUrl?`${base}${game.id}.html`:''}))
    .replace('/*__CODE__*/',()=>`'use strict';\n${code.join('\n\n')}`);
  fs.mkdirSync(out,{recursive:true});const file=path.join(out,game.id+'.html');fs.writeFileSync(file,html);
  return{file,bytes:Buffer.byteLength(html)};
}

function buildLauncher({out=path.join(root,'dist'),siteUrl=''}={}){
  fs.mkdirSync(out,{recursive:true});
  const template=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
  const hasPreview=id=>fs.existsSync(path.join(out,'previews',id+'.png'));
  const card=(game,href,external)=>`<a class="game" href="${escape(href)}"${external?' rel="noopener"':''}>
  ${hasPreview(game.id)?`<img src="previews/${game.id}.png" alt="${escape(game.title)} gameplay preview" loading="lazy">`:`<div class="placeholder" aria-hidden="true">${escape(game.title[0])}</div>`}
  <h2>${escape(game.title)}</h2><p>${escape(game.tagline)}</p><span>${external?'Play on its own site':'Play now'}</span></a>`;
  const cards=[...GAMES.map(g=>card(g,g.id+'.html',false)),...EXTERNAL.map(g=>card(g,g.href,true))].join('\n');
  const base=siteUrl.replace(/\/?$/,'/');
  const html=template.replace('<!--__GAMES__-->',()=>cards).replace('<!--__META__-->',()=>meta({title:'Glyph Arcade',description:'Small browser games drawn entirely in coloured letters. Each one is a single offline HTML file.',image:siteUrl&&hasPreview('delve')?`${base}previews/delve.png`:'',url:siteUrl?base:''}));
  fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'.nojekyll'),'');
  for(const asset of ['manifest.webmanifest','icon.svg','sw.js']){
    const src=path.join(root,'site',asset);
    if(fs.existsSync(src))fs.copyFileSync(src,path.join(out,asset));
  }
}

if(require.main===module){
  const siteUrl=process.env.PAGES_URL||'';
  for(const game of GAMES){const {file,bytes}=buildGame(game,{siteUrl});console.log(`Built ${path.relative(root,file)} (${bytes} bytes, no runtime dependencies).`);}
  buildLauncher({siteUrl});console.log('Built dist/index.html launcher.');
}
module.exports={GAMES,EXTERNAL,buildGame,buildLauncher};
