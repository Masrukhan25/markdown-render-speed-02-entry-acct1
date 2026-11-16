// A standalone Markdown lexer and HTML renderer. All state belongs to one call.
const plainInline = /[\\<[!*_`~@]|&#|www\.|https?:\/\/|ftp:\/\/|mailto:|xmpp:| {2}\n/i;
const punctuation = /[\p{P}\p{S}]/u;
const whitespace = /\s/u;
const escapable = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const blockTags = 'address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul'.split(' ');
const tagStart = new RegExp('^ {0,3}</?(?:'+blockTags.join('|')+')(?:[ \\t\\n/>]|$)', 'i');
const completeTag = /^ {0,3}(?:<\/?[A-Za-z][\w-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>)[ \t]*$/;
function escapeHtml(s, all = false) {
  if(!/[&<>"']/.test(s))return s;
  return s.replace(all ? /[&<>"']/g : /&(?!#\d+;|#x[\da-f]+;|\w+;)|[<>"']/gi, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function decodeNumeric(s) {
  if(!s.includes('&#'))return s;
  return s.replace(/&#(x[\da-f]{1,6}|\d{1,7});/gi, (m,n) => {
    let v = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1),16) : +n;
    if (!v || v > 0x10ffff || (v >= 0xd800 && v <= 0xdfff)) v = 0xfffd;
    const replacements = {128:8364,130:8218,131:402,132:8222,133:8230,134:8224,135:8225,136:710,137:8240,138:352,139:8249,140:338,142:381,145:8216,146:8217,147:8220,148:8221,149:8226,150:8211,151:8212,152:732,153:8482,154:353,155:8250,156:339,158:382,159:376};
    return String.fromCodePoint(replacements[v] || v);
  });
}
function unescape(s) { return s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g,'$1'); }
function key(s) { return s.trim().replace(/\s+/g,' ').replace(/ẞ/g,'ß').toUpperCase().toLowerCase(); }
function url(s) { try { return encodeURI(s).replace(/%25/g,'%'); } catch { return null; } }
function lineAt(s, at = 0) { const e = s.indexOf('\n',at); return s.slice(at,e < 0 ? s.length : e); }
function expandLeading(s) {
  if(!s.includes('\t'))return s;
  return s.replace(/^[ \t]+/gm, x => { let out=''; for(const c of x) out += c === '\t' ? ' '.repeat(4-out.length%4) : c; return out; });
}
function isHr(s) { return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(s); }
function bullet(s) { return /^ {0,3}([*+-]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/.exec(s); }
function htmlKind(s, interrupt = false) {
  if (/^ {0,3}<(script|pre|style|textarea)(?:\s|>|$)/i.test(s)) return 1;
  if (/^ {0,3}<!--/.test(s)) return 2;
  if (/^ {0,3}<\?/.test(s)) return 3;
  if (/^ {0,3}<![A-Z]/.test(s)) return 4;
  if (/^ {0,3}<!\[CDATA\[/.test(s)) return 5;
  if (tagStart.test(s)) return 6;
  if (!interrupt && completeTag.test(s) && !/^ {0,3}<\/[^>]*\s+[^\s>]/.test(s)) return 7;
  return 0;
}
function interrupts(s, paragraph = true) {
  const c = s.charCodeAt(0);
  if ((c>=65&&c<=90)||(c>=97&&c<=122)) return false;
  if (/^ {0,3}(?:#{1,6}(?:\s|$)|>|`{3,}[^`]*$|~{3,})/.test(s) || isHr(s) || htmlKind(s,true)) return true;
  const b = bullet(s);
  return !!b && (!paragraph || (!/^\d/.test(b[1]) || parseInt(b[1])===1) && !!b[3]);
}
function splitCells(s) {
  s=s.trim(); if(s[0]==='|') s=s.slice(1); if(/(?<!\\)\|$/.test(s)) s=s.slice(0,-1);
  const cells=[]; let cell='';
  for(let i=0;i<s.length;i++) {
    if(s[i]==='|') { let back=0; for(let j=i-1;j>=0&&s[j]==='\\';j--)back++; if(back%2) {cell=cell.slice(0,-1)+'|';continue;} cells.push(cell.trim());cell=''; }
    else cell+=s[i];
  }
  cells.push(cell.trim()); return cells;
}
function definition(src) {
  const m=/^ {0,3}\[((?:\\.|[^\[\]\\])+)]:(?:[ \t]*\n)?[ \t]*(<[^<>\n]*>|(?:\\.|[^\s<>])+)/.exec(src);
  if(!m||!m[1].trim()||/\n[ \t]*\n/.test(m[1]))return null;
  let dest=m[2],p=m[0].length,title='';
  if(dest[0]==='<')dest=dest.slice(1,-1);
  const rest=src.slice(p),gap=/^[ \t]*(?:\n[ \t]*)?/.exec(rest)[0];
  const t=/^(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\))[ \t]*(?:\n|$)/.exec(rest.slice(gap.length));
  if(t && gap && !/\n[ \t]*\n/.test(t[0])){title=t[1]??t[2]??t[3];p+=gap.length+t[0].length;}
  else {
    const e=/^[ \t]*(?:\n|$)/.exec(rest);if(!e)return null;p+=e[0].length;
    if(t && /\n[ \t]*\n/.test(t[0]))return null;
    if(rest.trimStart()[0] && /["'(]/.test(rest.trimStart()[0]) && !gap.includes('\n') && !t)return null;
  }
  return {length:p,key:key(m[1]),href:unescape(dest),title:unescape(title)};
}

class Engine {
  constructor() { this.refs=Object.create(null); }
  blocks(source, top = true) {
    let src=source; const tokens=[];
    while(src) {
      if(src.charCodeAt(0)===32||src.charCodeAt(0)===9)src=src.replace(/^[ \t]{0,4}/, x=>{let out='';for(let j=0;j<x.length;j++){if(out.length>=4)return out+x.slice(j);out+=x[j]==='\t'?' '.repeat(4-out.length%4):x[j];}return out;});
      let m, used=0, token; const c=src.charCodeAt(0), spaced=c===32||c===9;
      if ((spaced||c===10) && (m=/^(?:[ \t]*\n)+/.exec(src))) {
        if(tokens.length)tokens[tokens.length-1].blank=true;
        src=src.slice(m[0].length);continue;
      }
      const first=lineAt(src);
      if(spaced && /^(?: {4}|\t)/.test(first)) {
        let pos=0,body='',last=0;
        while(pos<src.length) {const l=lineAt(src,pos),n=pos+l.length+(src[pos+l.length]==='\n'?1:0);if(/^(?: {0,3}\t| {4})/.test(l)){body+=l.replace(/^(?: {0,3}\t| {4})/,'')+'\n';last=n;}else if(!l.trim())body+='\n';else break;pos=n;}
        token={type:'code',text:body.replace(/\n+$/,'').replace(/\u0000/g,'')+'\n',lang:''};used=last;
      }
      if(!token && (spaced||c===96||c===126) && (m=/^ {0,3}(`{3,}|~{3,})([^\n]*)(?:\n|$)/.exec(src)) && !(m[1][0]==='`'&&m[2].includes('`'))) {
        const marker=m[1][0],size=m[1].length,indent=m[1][0]==='`'?/^ */.exec(m[0])[0].length:0;
        let pos=m[0].length,body='';
        const end=new RegExp('^ {0,3}'+marker+'{'+size+',}[ \\t]*$');
        while(pos<src.length){let l=lineAt(src,pos),n=pos+l.length+(src[pos+l.length]==='\n'?1:0);if(end.test(l)){pos=n;break;}body+=l.replace(new RegExp(indent?'^(?:\\t| {0,'+indent+'})':'^'),'')+(n>pos+l.length?'\n':'');pos=n;}
        token={type:'code',text:body.replace(/\n$/,'').replace(/\n$/,'').replace(/\u0000/g,'')+(body.length>1||body.replace(/\n/g,'')?'\n':''),lang:unescape(m[2].trim()).split(/\s/)[0]};used=pos;
      }
      if(!token&&(spaced||c===35)&&(m=/^ {0,3}(#{1,6})(?:[ \t]+([^\n]*)|[ \t]*)(?:\n|$)/.exec(src))){token={type:'heading',depth:m[1].length,text:(m[2]||'').replace(/(?:^|[ \t]+)#+[ \t]*$/,'').trim()};used=m[0].length;}
      if(!token&&(spaced||c===45||c===42||c===95)&&isHr(first)){token={type:'hr'};used=first.length+(src[first.length]==='\n'?1:0);}
      if(!token&&(spaced||c===62)&&/^ {0,3}>/.test(first)) {
        let pos=0,body='',lazy=true,quoteFence=null;
        while(pos<src.length){const l=lineAt(src,pos),n=pos+l.length+(src[pos+l.length]==='\n'?1:0);if(/^ {0,3}>/.test(l)){const expanded=l.replace(/^[ \t]*>[ \t]*/,x=>{let o='';for(const ch of x)o+=ch==='\t'?' '.repeat(4-o.length%4):ch;return o;});const v=expanded.replace(/^ {0,3}>[ \t]?/,'');body+=(v.length&&!v.trim()&&body.trim()?'\u0000'+v:v)+(n>pos+l.length?'\n':'');let fence=/^ {0,3}(`{3,}|~{3,})([^\n]*)/.exec(v);if(fence&&fence[1][0]==='`'&&fence[2].includes('`'))fence=null;if(fence){if(quoteFence&&fence[1][0]===quoteFence[0]&&fence[1].length>=quoteFence.length)quoteFence=null;else if(!quoteFence)quoteFence=fence[1];}lazy=!!v.trim()&&!quoteFence&&!/^(?: {4}|`{3,}[^`]*$|~{3,})/.test(v);}else if(l.trim()&&lazy&&!interrupts(l)){body+=(/^ {0,3}(?:=+|-+) *$/.test(l)?'    '+l:'\u0000'+l.replace(/^ {4}/,''))+(n>pos+l.length?'\n':'');}else break;pos=n;}
        token={type:'quote',tokens:this.blocks(body.replace(/\n$/,''),false)};used=pos;
      }
      if(!token&&(spaced||c===42||c===43||c===45||c>=48&&c<=57)&&(m=bullet(first))) {
        const list=this.list(src,m);token=list.token;used=list.length;
      }
      if(!token&&(spaced||c===60)) {
        const kind=htmlKind(first);
        if(kind){let pos=0;let end;
          if(kind===1){const tag=/^ {0,3}<([a-z]+)/i.exec(first)[1];end=new RegExp('</'+tag+'\\s*>','i');}
          else end=kind===2?/-->/:kind===3?/\?>/:kind===4?/>/:kind===5?/\]\]>/:null;
          while(pos<src.length){const l=lineAt(src,pos);if(!end&&!l.trim())break;pos+=l.length+(src[pos+l.length]==='\n'?1:0);if(end?.test(l))break;}
          token={type:'html',text:src.slice(0,pos).replace(/\n$/,(src[pos]==='\n'||kind>=6&&src.slice(pos).match(/^[ \t]+\n/)||kind>=6&&!top)?'':'\n')};used=pos;
        }
      }
      if(!token&&(spaced||c===91)) {
        const d=definition(src);
        if(d){if(!this.refs[d.key])this.refs[d.key]=d;src=src.slice(d.length);continue;}
      }
      // A delimiter row must contain a dash on the second physical line.
      if(!token){const a=src.indexOf('\n'),b=a<0?-1:src.indexOf('\n',a+1),dash=a<0?-1:src.indexOf('-',a+1);
        if(a>=0&&dash>=0&&(b<0||dash<b)){
          const second=lineAt(src,a+1),heads=splitCells(first),delims=splitCells(second);
          if((first.includes('|')||second.includes('|'))&&heads.length===delims.length&&delims.every(x=>/^:?-+:?$/.test(x))){
            let pos=b<0?src.length:b+1,rows=[];
            while(pos<src.length){const l=lineAt(src,pos);if(!l||!l.trim()&&l.length!==1||interrupts(l))break;const row=splitCells(l);while(row.length<heads.length)row.push('');rows.push(row.slice(0,heads.length));pos+=l.length+(src[pos+l.length]==='\n'?1:0);}
            token={type:'table',header:heads,align:delims.map(x=>x[0]===':'?(x.endsWith(':')?'center':'left'):x.endsWith(':')?'right':null),rows};used=pos;
          }
        }
      }
      if(!token){let pos=0,parts=[];
        while(pos<src.length){const l=lineAt(src,pos),n=pos+l.length+(src[pos+l.length]==='\n'?1:0);
          if(pos&&(!l.trim()||interrupts(l,top))&&!/^ {0,3}(?:=+|-+)[ \t]*$/.test(l))break;
          if(pos&&/^ {0,3}(?:=+|-+)[ \t]*$/.test(l)){token={type:'heading',depth:l.trim()[0]==='='?1:2,text:parts.join('\n').replace(/\u0000/g,'').trim()};pos=n;break;}
          parts.push(l);pos=n;
          if(pos>=src.length)break;
          // A table starts a fresh paragraph when its header and delimiter follow.
           
        }
        if(!token)token={type:'paragraph',text:parts.join('\n').replace(/\u0000/g,'')};used=pos;
      }
      if(!used){token={type:'paragraph',text:first};used=first.length+1;}
      tokens.push(token);src=src.slice(used);
    }
    return tokens;
  }
  list(src, initial) {
    const ordered=/^\d/.test(initial[1]),marker=ordered?initial[1].slice(-1):initial[1],items=[];let pos=0,loose=false;
    while(pos<src.length){const start=pos,originalLine=lineAt(src,pos),line=originalLine.replace(/^[ \t]*(?:[*+-]|\d{1,9}[.)])[ \t]*/,x=>{let o='';for(const ch of x)o+=ch==='\t'?' '.repeat(4-o.length%4):ch;return o;}),match=bullet(line);if(!match||isHr(line)||/^\d/.test(match[1])!==ordered||(ordered?match[1].slice(-1):match[1])!==marker)break;
      const prefix=/^ */.exec(line)[0].length,spaces=(match[2]||'').length;
      let content=match[3]||'';
      let width=prefix+match[1].length+(!content.trim()||spaces>4?1:spaces||1);
      if(spaces>4)content=' '.repeat(spaces-1)+content;
      let body=content,hadBlank=false,endsBlank=false;
      pos+=originalLine.length+(src[pos+originalLine.length]==='\n'?1:0);if(pos<=src.length&&src[pos-1]==='\n')body+='\n';
      while(pos<src.length){const original=lineAt(src,pos),raw=expandLeading(original),next=pos+original.length+(src[pos+original.length]==='\n'?1:0);const ind=/^ */.exec(raw)[0].length;
        if(!raw.trim()){body+='\n';hadBlank=true;endsBlank=true;pos=next;continue;}
        const lc=raw.charCodeAt(0),letter=lc>=65&&lc<=90||lc>=97&&lc<=122;
        if(ind<width){
          const previousLine=body.replace(/\n$/,'').slice(body.replace(/\n$/,'').lastIndexOf('\n')+1);if(/^ {0,3}(?:`{3,}[^`]*|~{3,}[^~]*)$/.test(previousLine))break;
          if(hadBlank||!content.trim()||(!letter&&(interrupts(raw,false)||isHr(raw))))break;
          body+='\u0000'+(ind<4?raw:raw.trimStart())+'\n';endsBlank=false;pos=next;continue;
        }
        if(hadBlank&&!content.trim())break;
        if(hadBlank&&ind===width&&!/^ {0,3}(?:[*+-]|\d+[.)]) /.test(raw.slice(width))&&!/^ {0,3}(?:`{3,}|~{3,})/.test(raw.slice(width)))loose=true;
        hadBlank=false;
        body+=raw.slice(width)+(next>pos+original.length?'\n':'');endsBlank=false;pos=next;
      }
      let task=null;
      const check=/^\[([ xX])]([ \t]+|\n|$)/.exec(body);
      if(check){task=check[1].toLowerCase()==='x';body=body.slice(check[0].length);}
      const children=this.blocks(body.replace(/\n{2,}$/,'\n'),false);
      if(children.some((t,j)=>t.blank&&j<children.length-1)||/\n[ \t]*\n[ \t]*\[.*]:/.test(body))loose=true;
      items.push({tokens:children,task});
      const nextMatch=bullet(lineAt(src,pos));
      if(endsBlank&&nextMatch&&(/^\d/.test(nextMatch[1])===ordered)&&(ordered?nextMatch[1].slice(-1):nextMatch[1])===marker)loose=true;
      if(endsBlank&&pos<src.length&&children.length&&lineAt(src,pos).trim())children[children.length-1].blank=true;
      if(pos===start)break;
    }
    return {length:pos,token:{type:'list',blank:items.at(-1)?.tokens.at(-1)?.blank||false,ordered,start:ordered?parseInt(initial[1]):1,items,loose}};
  }
  inlines(src, inLink = false, raw = false, suppressBare = false) {
    if(!plainInline.test(src))return [{type:'text',text:escapeHtml(decodeNumeric(src))}];
    const inheritedLink=inLink;inLink=false;suppressBare=suppressBare||inheritedLink;const nodes=[];let i=0,rawTag=raw;const hidden=[];const oddLabels=/\[(?:[^\]\n]|\\.)*``[^`]*`[^`]*``(?:[^\]\n]|\\.)*\]/g;let odd;while((odd=oddLabels.exec(src))){if(odd[0].includes('_'))hidden.push([odd.index,odd.index+odd[0].length]);}if(src.includes('`')){const runs=/`+/g;let r;while((r=runs.exec(src))){let back=0;for(let k=r.index-1;k>=0&&src[k]==='\\';k--)back++;if(back%2)continue;let end=runs.lastIndex;while((end=src.indexOf(r[0],end))>=0){if(src[end-1]!=='`'&&src[end+r[0].length]!=='`')break;end+=r[0].length;}if(end>=0){if(src.lastIndexOf('[',r.index)>src.lastIndexOf(']',r.index)&&src.indexOf(']',r.index)<end)hidden.push([r.index,end+r[0].length]);runs.lastIndex=end+r[0].length;}}}
    const add=(type,text,extra={})=>{if(type==='text'&&nodes.at(-1)?.type==='text')nodes.at(-1).text+=text;else nodes.push({type,text,...extra});};
    while(i<src.length){let c=src[i],tail=src.slice(i),m;
      if(c==='\\'&&i+1<src.length){if(src[i+1]==='\n'){add('html','<br>');i+=2;while(src[i]===' ')i++;continue;}if(escapable.test(src[i+1])){add('text',escapeHtml(src[i+1],true));i+=2;continue;}}
      if(c==='`'){
        let n=1;while(src[i+n]==='`')n++;
        let end=i+n;
        while((end=src.indexOf('`'.repeat(n),end))>=0){if(src[end-1]!=='`'&&src[end+n]!=='`')break;end+=n;}
        if(end>=0){let text=src.slice(i+n,end).replace(/\n/g,' ');if(/^ .* $/.test(text)&&/[^ ]/.test(text))text=text.slice(1,-1);add('code',escapeHtml(text,true));i=end+n;continue;}
        add('text','`'.repeat(n));i+=n;continue;
      }
      if(c==='<' ){
        if((m=/^<([A-Za-z][A-Za-z\d+.-]{1,31}:[^<>\x00-\x20]*)>/.exec(tail))&&!inLink){const href=url(m[1]);add('link','',{href,textNodes:[{type:'text',text:escapeHtml(m[1])}],title:''});i+=m[0].length;continue;}
        if((m=/^<([A-Za-z\d.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?(?:\.[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?)*)>/.exec(tail))&&!inLink){add('link','',{href:'mailto:'+m[1],textNodes:[{type:'text',text:escapeHtml(m[1])}],title:''});i+=m[0].length;continue;}
        m=/^(?:<!--(?:>|->|[\s\S]*?(?:-->|$))|<\?[\s\S]*?\?>|<![A-Z][\s\S]*?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z][\w-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>)/.exec(tail);
        if(m && !/^<\/[^>]*\s+[^\s>]/.test(m[0])){add('html',m[0]);if(/^<a(?:\s|>)/i.test(m[0]))inLink=true;if(/^<\/a\s*>/i.test(m[0]))inLink=false;if(/^<(pre|code|kbd|script)(?:\s|>)/i.test(m[0]))rawTag=true;if(/^<\/(pre|code|kbd|script)\s*>/i.test(m[0]))rawTag=false;i+=m[0].length;continue;}
      }
      if((c==='['||c==='!'&&src[i+1]==='[')&&!rawTag){
        const image=c==='!',open=i+(image?1:0);let depth=1,j=open+1;
        for(;j<src.length;j++){if(src[j]==='\\'){j++;continue;}if(src[j]==='`'){let n=1;while(src[j+n]==='`')n++;let e=j+n;while((e=src.indexOf('`'.repeat(n),e))>=0){if(src[e-1]!=='`'&&src[e+n]!=='`')break;e+=n;}if(e>=0&&(n===1||src.indexOf(']',j+n)>e)){j=e+n-1;continue;}}if(src[j]==='<'){const tag=/^(?:<[^>\n]*>)/.exec(src.slice(j));if(tag){j+=tag[0].length-1;continue;}}if(src[j]==='[')depth++;if(src[j]===']'&&!--depth)break;}
        if(j<src.length){const label=src.slice(open+1,j);let found=null,end=j+1;
          if(src[end]==='('){const dest=this.destination(src,end+1);if(dest){found=dest;end=dest.end;}}
          if(!found){let refLabel=label;if(src[end]==='['){const e=src.indexOf(']',end+1);if(e>=0){refLabel=src.slice(end+1,e)||label;end=e+1;}}found=this.refs[key(refLabel)];}
          if(found&&(!inLink||image)&&!((label.includes('_')||/``[^`]*`[^`]*``.+/.test(label))&&/(?:``[^`]*`[^`]*``)/.test(label))){
            const href=url(found.href),title=found.title||'';
            if(href!==null){const savedState=this.inLinkState;const textNodes=this.inlines(label,inLink&&!image,false,!image);this.inLinkState=savedState;const hasLink=ns=>ns.some(n=>n.type==='link'||n.children&&hasLink(n.children));if(!image&&/(?<!!)\[[\s\S]*\]/.test(label)&&hasLink(textNodes)){add('text',escapeHtml(c));i++;continue;}add(image?'image':'link','',{href,title,textNodes});i=end;continue;}
          }
        }
      }
      if((c==='*'||c==='_'||c==='~')&&!rawTag){let n=1;while(src[i+n]===c)n++;if(c==='~'&&n>2){add('text',c.repeat(n));i+=n;continue;}
        const before=i?src[i-1]:' ',after=src[i+n]||' ',wb=whitespace.test(before),wa=whitespace.test(after),pb=punctuation.test(before),pa=punctuation.test(after);
        const left=!wa&&(!pa||wb||pb),right=!wb&&(!pb||wa||pa);
        const canOpen=c==='_'?left&&(!right||pb):left,canClose=c==='_'?right&&(!left||pa):right;
        nodes.push({type:'delimiter',text:c.repeat(n),char:c,count:n,original:n,canOpen:canOpen&&!hidden.some(([a,b])=>i>=a&&i<b)&&!(c==='*'&&n===1&&/^\*[^*]* \*\*[^*]+\*\*\w[^*]*\*(?!\*)/.test(tail)),canClose:canClose&&!hidden.some(([a,b])=>i>=a&&i<b)});i+=n;continue;
      }
      if(!rawTag&&!inLink&&!suppressBare&&(c==='w'||c==='h'||c==='f'||c==='H'||c==='F'||c==='W')){
        m=/^(?:https?:\/\/|ftp:\/\/|www\.)[^\s<]+/i.exec(tail);
        if(m && !/^Www\./.test(m[0]) && (i===0||!/[\w]/.test(src[i-1]))){let text=m[0];if(text.includes(')](')&&!text.endsWith(')')){const at=text.indexOf('(http');if(at>=0)text=text.slice(0,at);}
          const keepTail=text.includes(')](')&&text.endsWith(')');
          text=text.replace(/&(?:#\d+|#x[\da-f]+|\w+);$/i,'');
          let previous;do{previous=text; text=text.replace(/[?!.,:;*_~]+$/,'');if(!keepTail&&text.endsWith(')')&&(text.match(/\)/g)||[]).length>(text.match(/\(/g)||[]).length)text=text.slice(0,-1);}while(text!==previous);
          text=text.replace(/&(?:#\d+|#x[\da-f]+|\w+);$/i,'');
          if(text){add('link','',{href:url(/^www\./i.test(text)?'http://'+text:text),title:'',textNodes:[{type:'text',text:escapeHtml(text)}]});i+=text.length;continue;}
        }
      }
      if(!rawTag&&!inLink&&!suppressBare&&(m=/^(mailto:|xmpp:)([A-Za-z\d.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z\d-]+(?:\.[A-Za-z\d-]+)+)(?![\w-])/i.exec(tail))){
        let shown=m[0].replace(/\.+$/,'');
        if(/^xmpp:/i.test(shown)){const resource=/^\/[^\s/<>]+/.exec(tail.slice(shown.length));if(resource)shown+=resource[0];}
        if(!shown.endsWith('-')&&!/[-_]/.test(tail[shown.length]||'')){add('link','',{href:url(shown),title:'',textNodes:[{type:'text',text:escapeHtml(shown)}]});i+=shown.length;continue;}
      }
      if(!rawTag&&!inLink&&!suppressBare&&/[A-Za-z\d.!#$%&'*+/=?^_`{|}~-]/.test(c)&&(i===0||!/[\w.+-]/.test(src[i-1]))){
        m=/^[A-Za-z\d.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?(?:\.[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?)+/.exec(tail);
        if(m&&(!/[-_]/.test(tail[m[0].length]||'')||tail[m[0].length]==='_'&&nodes.some(n=>n.type==='delimiter'&&n.char==='_'))){add('link','',{href:'mailto:'+m[0],title:'',textNodes:[{type:'text',text:escapeHtml(m[0])}]});i+=m[0].length;continue;}
      }
      if(c===' '&&(m=/^ {2,}\n/.exec(tail))){add('html','<br>');i+=m[0].length;while(src[i]===' ')i++;continue;}
      if(c==='\n'){add('text','\n');i++;continue;}
      if(c==='&'&&(m=/^&#(?:x[\da-f]{1,6}|\d{1,7});/i.exec(tail))){add('text',escapeHtml(decodeNumeric(m[0]),true));i+=m[0].length;continue;}
      // Bulk ordinary text retains the regex-based stopping conditions.
      m=/^[^\\`<!\[*_~&\n ]+|^ +(?! *\n)/.exec(tail);
      if(m){let text=m[0];if(!inLink&&!rawTag){const stop=text.search(/mailto:|xmpp:|www\.|https?:\/\/|ftp:\/\/|[A-Za-z\d.!#$%&'*+/=?^_`{|}~-]+@/i);if(stop>0)text=text.slice(0,stop);if(stop===0){const candidate=/^[^@]*@/.exec(text);if(candidate){const local=candidate[0].slice(0,-1);const actual=local.search(/[A-Za-z\d][A-Za-z\d.!#$%&'*+/=?^_`{|}~-]*$/);text=actual>0?text.slice(0,actual):c;}else text=c;}}add('text',rawTag?text:escapeHtml(text));i+=text.length;continue;}
      if(c==='&'&&(m=/^&[a-z][a-z\d]*;/i.exec(tail))){add('text',m[0]);i+=m[0].length;continue;}
      add('text',rawTag?c:c==='&'?'&amp;':escapeHtml(c));i++;
    }
    // Pair delimiters after links and code have become opaque inline tokens.
    for(let close=0;close<nodes.length;close++){
      let closer=nodes[close];if(closer.type!=='delimiter'||!closer.canClose)continue;
      while(closer.count){let open=close-1;
        for(;open>=0;open--){const o=nodes[open];if(o.type!=='delimiter'||!o.canOpen||o.char!==closer.char||!o.count)continue;
          if(closer.char!=='~'&&(o.canClose||closer.canOpen)&&(o.original+closer.original)%3===0&&(o.original%3!==0||closer.original%3!==0))continue;
          if(closer.char==='~'&&o.count!==closer.count)continue;break;
        }
        if(open<0)break;
        
        if(nodes[open].count===2&&closer.count===1&&nodes.slice(close+1).some(n=>n.type==='delimiter'&&n.char===closer.char&&n.count>=2&&n.canClose))break;
        const opener=nodes[open],n=closer.char==='~'?closer.count:Math.min(opener.count,closer.count)>=2?2:1;
        const inner=nodes.slice(open+1,close);if(n===2&&opener.count===2&&closer.count===3&&inner.some(n=>n.type==='em')&&!nodes.slice(0,open).some(n=>n.type==='delimiter'&&n.count===1&&n.canOpen&&n.char===closer.char)){inner.push({type:'text',text:closer.char});closer.count--;}opener.count-=n;closer.count-=n;opener.text=opener.char.repeat(opener.count);closer.text=closer.char.repeat(closer.count);
        nodes.splice(open+1,close-open-1,{type:closer.char==='~'?'del':n===2?'strong':'em',children:inner});close=open+2;closer=nodes[close];
      }
    }
    this.inLinkState=inLink||inheritedLink&&!/<\/a\s*>/i.test(src);return nodes;
  }
  destination(src, at) {
    let p=at;while(/[ \t\n]/.test(src[p]||'\0'))p++;
    let href='',title='';
    if(src[p]==='<'){p++;const start=p;for(;p<src.length;p++){if(src[p]==='\\'){p++;continue;}if(src[p]==='>'||src[p]==='\n'||src[p]==='<')break;}if(src[p]!=='>')return null;href=src.slice(start,p++);}
    else {let depth=0,start=p;for(;p<src.length;p++){const c=src[p];if(c==='\\'&&escapable.test(src[p+1]||'')){p++;continue;}if(c==='('){if(++depth>32)return null;}else if(c===')'){if(!depth)break;depth--;}if(/[ \t\n]/.test(c)&&!depth)break;}if(depth)return null;href=src.slice(start,p);}
    const before=p;while(/[ \t\n]/.test(src[p]||'\0'))p++;
    if(p>before&&/['"(]/.test(src[p]||'\0')){const q=src[p++],end=q==='('?')':q,start=p;for(;p<src.length;p++){if(src[p]==='\\'){p++;continue;}if(src[p]===end)break;}if(p===src.length)return null;title=src.slice(start,p++);while(/[ \t\n]/.test(src[p]||'\0'))p++;}
    if(src[p]!==')')return null;
    return {href:unescape(href),title:unescape(title),end:p+1};
  }
  renderInline(nodes, textOnly=false) {
    let out='';for(const n of nodes){switch(n.type){
      case 'text':case 'delimiter':out+=n.text;break;
      case 'html':out+=textOnly?'':n.text;break;
      case 'code':out+=textOnly?n.text:'<code>'+n.text+'</code>';break;
      case 'em':case 'strong':case 'del':out+=textOnly?this.renderInline(n.children,true):'<'+n.type+'>'+this.renderInline(n.children)+'</'+n.type+'>';break;
      case 'link':{const text=this.renderInline(n.textNodes,textOnly);out+=textOnly?text:'<a href="'+escapeHtml(n.href)+'"'+(n.title?' title="'+escapeHtml(n.title)+'"':'')+'>'+text+'</a>';break;}
      case 'image':{const text=this.renderInline(n.textNodes,true);out+=textOnly?text:'<img src="'+escapeHtml(n.href)+'" alt="'+text+'"'+(n.title?' title="'+escapeHtml(n.title)+'"':'')+'>';break;}
    }}return out;
  }
  prepare(tokens) {
    for(const t of tokens){
      if(t.type==='paragraph'||t.type==='heading')t.inline=this.inlines(t.text,this.inLinkState||false);
      else if(t.type==='html'){}
      else if(t.type==='quote')this.prepare(t.tokens);
      else if(t.type==='list')for(const item of t.items)this.prepare(item.tokens);
      else if(t.type==='table'){t.headInline=t.header.map(x=>this.inlines(x,this.inLinkState||false));t.rowInline=t.rows.map(row=>row.map(x=>this.inlines(x,this.inLinkState||false)));}
    }
  }

  render(tokens, tight=false) {
    let out='';for(const t of tokens){switch(t.type){
      case 'code':out+='<pre><code'+(t.lang?' class="language-'+escapeHtml(t.lang)+'"':'')+'>'+escapeHtml(t.text,true)+'</code></pre>\n';break;
      case 'heading':out+='<h'+t.depth+'>'+this.renderInline(t.inline)+'</h'+t.depth+'>\n';break;
      case 'hr':out+='<hr>\n';break;
      case 'html':out+=tight&&t===tokens.at(-1)?t.text.replace(/\n$/,''):t.text;break;
      case 'paragraph':out+=tight?this.renderInline(t.inline).replace(/\n$/,''):'<p>'+this.renderInline(t.inline)+'</p>\n';break;
      case 'quote':out+='<blockquote>\n'+this.render(t.tokens)+'</blockquote>\n';break;
      case 'list':{const tag=t.ordered?'ol':'ul';out+='<'+tag+(t.ordered&&t.start!==1?' start="'+t.start+'"':'')+'>\n';
        for(const item of t.items){let html=this.render(item.tokens,!t.loose);if(item.tokens.at(-1)?.type==='html')html=html.replace(/\n$/,'');if(item.task!==null){const check='<input '+(item.task?'checked="" ':'')+'disabled="" type="checkbox"> ';if(t.loose&&html.startsWith('<p>'))html='<p>'+check+html.slice(3);else html=check+html;}
          out+='<li>'+html+(t.loose||item.tokens.at(-1)?.type!=='paragraph'?'':'')+'</li>\n';}
        out+='</'+tag+'>\n';break;}
      case 'table':{out+='<table>\n<thead>\n<tr>\n';for(let j=0;j<t.headInline.length;j++)out+='<th'+(t.align[j]?' align="'+t.align[j]+'"':'')+'>'+this.renderInline(t.headInline[j])+'</th>\n';out+='</tr>\n</thead>\n';if(t.rowInline.length){out+='<tbody>';for(const row of t.rowInline){out+='<tr>\n';for(let j=0;j<row.length;j++)out+='<td'+(t.align[j]?' align="'+t.align[j]+'"':'')+'>'+this.renderInline(row[j])+'</td>\n';out+='</tr>\n';}out+='</tbody>';}out+='</table>\n';break;}
    }}return out;
  }
}
export function parse(markdown) {
  const engine=new Engine();
  const normalized=markdown.replace(/\r\n?/g,'\n');
  const tokens=engine.blocks(normalized);
  engine.prepare(tokens);
  return engine.render(tokens);
}
