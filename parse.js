// Fresh default-GFM renderer: block tree, inline tokenization, then HTML output.
const escapeHtml = (s) => decode(s).replace(/&(?!(?:#[0-9]{1,7}|#x[\da-f]{1,6}|[a-z][a-z0-9]*);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const encode = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const unescape = s => s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');
const decode = s => s.replace(/&#(x[\da-f]{1,6}|\d{1,7});/gi, (_, n) => ((v) => v > 0 && v <= 0x10ffff && !(v>=0xd800 && v<=0xdfff) ? String.fromCodePoint(v) : '\ufffd')(parseInt(n[0].toLowerCase() === 'x' ? n.slice(1) : n, n[0].toLowerCase() === 'x' ? 16 : 10))).replace(/&colon;/gi, ':');
const norm = s => s.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase();
const punct = c => !!c && /[\p{P}\p{S}]/u.test(c);
const white = c => !c || /\s/u.test(c);
const bullet = s => /^( {0,3})([*+-]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/.exec(s);
const rule = s => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(s);
const fence = s => /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(s);
const heading = s => /^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(s);
const blockTags = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
const htmlBlock = new RegExp('^ {0,3}</?(?:' + blockTags + ')(?:\\s|/?>|$)', 'i');
const tagRe = /^(?:<!--(?:>|->|[\s\S]*?(?:-->|$))|<\?[\s\S]*?\?>|<![A-Z][\s\S]*?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z][\w:-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>)/;
function htmlKind(s, interrupt = false) {
  if(/^ {0,3}<\/?[A-Za-z][\w-]*:/.test(s)||/^ {0,3}<\/[^>]+\s+[^>]+>/.test(s))return 0;
  if (/^ {0,3}<(script|pre|style|textarea)(?:\s|>|$)/i.test(s)) return 1;
  if (/^ {0,3}<!--/.test(s)) return 2;
  if (/^ {0,3}<\?/.test(s)) return 3;
  if (/^ {0,3}<![A-Z]/.test(s)) return 4;
  if (/^ {0,3}<!\[CDATA\[/.test(s)) return 5;
  if (htmlBlock.test(s)) return 6;
  if (!interrupt && /^ {0,3}/.test(s) && tagRe.test(s.trimStart()) && !s.trimStart().slice(tagRe.exec(s.trimStart())[0].length).trim()) return 7;
  return 0;
}
function interrupts(s, anyOrdered=false) {
  const b = bullet(s);
  return !!(heading(s) || fence(s) && !(fence(s)[1][0] === '`' && fence(s)[2].includes('`')) || rule(s) || /^ {0,3}>/.test(s) || htmlKind(s, true) || b && b[4] && (!/^\d/.test(b[2]) || anyOrdered || parseInt(b[2]) === 1));
}
function endsParagraph(ts){const t=ts.filter(x=>x.type!=='space').at(-1);return t?.type==='paragraph'||t?.type==='text'||t?.children&&endsParagraph(t.children)||t?.items&&endsParagraph(t.items.at(-1).children);}
function cells(s) {
  s = s.trim();
  if (s[0] === '|') s = s.slice(1);
  if (/(?<!\\)\|$/.test(s)) s = s.slice(0, -1);
  const out = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '|' && (i === 0 || s[i-1] !== '\\' || (() => { let n=0; for(let j=i-1;j>=0&&s[j]==='\\';j--)n++; return n%2===0; })())) { out.push(cur.trim()); cur=''; }
    else if (s[i] === '\\' && s[i+1] === '|') { cur += '|'; i++; }
    else cur += s[i];
  }
  out.push(cur.trim()); return out;
}
function detab(s) {
  let col = 0, out = '';
  for (const c of s) { if (c === '\t') { const n = 4-col%4; out += ' '.repeat(n); col+=n; } else {out+=c; col++;} }
  return out;
}
function blocks(source, refs, top = true) {
  const lines = source.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const out=[]; let i=0;
  while (i<lines.length) {
    const line=lines[i],bc=line.charCodeAt(0),sp=bc===32||bc===9;
    if (!line.trim()) { out.push({type:'space'}); i++; continue; }
    if (sp&&/^(?: {4}| {0,3}\t)/.test(line)) {
      let body=[], j=i;
      while(j<lines.length && (!lines[j].trim() || /^(?: {4}| {0,3}\t)/.test(lines[j]))) {body.push(lines[j].length>=4||lines[j].includes('\t') ? lines[j].replace(/^(?: {4}| {0,3}\t)/, '') : '');j++;}
      while(body.at(-1)==='') body.pop();
      out.push({type:'code',text:body.join('\n'),lang:''});i=j;continue;
    }
    const f=(sp||bc===96||bc===126)&&fence(line);
    if (f && !(f[1][0]==='`' && f[2].includes('`'))) {
      const indent=f[1][0]==='`'?line.match(/^ */)[0].length:0; let body=[],j=i+1;
      const close=new RegExp('^ {0,3}'+(f[1][0]==='`'?'`':'~')+'{'+f[1].length+',}[ \\t]*$');
      while(j<lines.length&&!close.test(lines[j])) {body.push(lines[j].replace(new RegExp(indent?'^(?: {0,'+(indent-1)+'}\\t| {0,'+indent+'})':'^'),'')); j++;}
      out.push({type:'code',text:body.join('\n'),lang:unescape(f[2].trim()).split(/\s+/)[0]});i=j<lines.length?j+1:j;continue;
    }
    const h=(sp||bc===35)&&heading(line);
    if(h) {out.push({type:'heading',depth:h[1].length,text:(h[2]||'').replace(/(?:[ \t]+#+[ \t]*|^[ \t]*#+[ \t]*)$/,'').trim()});i++;continue;}
    if((sp||bc===42||bc===45||bc===95)&&rule(line)) {out.push({type:'hr'});i++;continue;}
    if((sp||bc===62)&&/^ {0,3}>/.test(line)) {
      let b=[],j=i,blank=false;
      while(j<lines.length) {
        if(/^ {0,3}>/.test(lines[j])) {const x=lines[j].replace(/^([ ]{0,3}>)[ \t]*/,m=>detab(m)).replace(/^ {0,3}> ?/,'');b.push(x);blank=!x.trim();j++;}
        else if(lines[j].trim()&&!blank&&!interrupts(lines[j])&&endsParagraph(blocks(b.join('\n'),new Map(refs),true))) {b.push(/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[j])?'    '+lines[j]:lines[j]);j++;}
        else break;
      }
      const children=blocks(b.join('\n'),refs,true); for(const t of children)if(t.type==='paragraph')t.text=t.text.replace(/\n {4,}(?=[*+-] )/g,'\n');out.push({type:'quote',children});i=j;continue;
    }
    const b=(sp||bc===42||bc===43||bc===45||bc>=48&&bc<=57)&&bullet(line);
    if(b) {
      const ordered=/^\d/.test(b[2]), marker=ordered?b[2].at(-1):b[2];
      const items=[]; let j=i,loose=false;
      while(j<lines.length) {
        const m=bullet(lines[j]);
        if(!m || /^\d/.test(m[2])!==ordered || (ordered?m[2].at(-1):m[2])!==marker || rule(lines[j])) break;
        const expanded=detab(lines[j]); const mm=bullet(expanded);
        let padding=(mm[4]||'').trim()?(mm[3]||'').length:1; if(padding>4) padding=1;
        const indent=mm[1].length+mm[2].length+(padding||1);
        let content=expanded.slice(Math.min(indent, expanded.length)), body=[content], k=j+1, seenBlank=!content.trim(), internalBlank=false;
        while(k<lines.length) {
          if(!content.trim() && k===j+1 && !lines[k].trim()){while(k<lines.length&&!lines[k].trim())k++;if(bullet(lines[k]||''))loose=true;break;}
          const raw=lines[k].replace(/^ *\t[ \t]*/,m=>detab(m));
          if(!raw.trim()) {body.push(''); seenBlank=true;k++;continue;}
          const ind=raw.match(/^ */)[0].length;
          if(ind>=indent) { if(seenBlank&&body.some(x=>x.trim())) internalBlank=true;body.push(raw.slice(indent));seenBlank=false;k++;continue; }
          if(bullet(raw)||rule(raw)||interrupts(raw)||seenBlank||fence(body.at(-1)||'')) break;
          body.push(ind>=4&&!bullet(raw.slice(4))?raw.slice(4):raw);k++;
        }
        let tail=0;while(body.at(-1)===''){body.pop();tail++;} if(!body.length)tail=0;
        const next=bullet(lines[k]||'');
        if(tail&&next&&/^\d/.test(next[2])===ordered&&(ordered?next[2].at(-1):next[2])===marker) loose=true;
        let text=body.join('\n');if(internalBlank&&/\n\n[ \t]*\[[^\]]+\]:/.test(text))loose=true; const task=/^\[([ xX])\](?:[ \t]+|$)/.exec(text);
        if(task) text=text.slice(task[0].length);
        const children=blocks(text,refs,false);for(const t of children)if(t.type==='text')t.text=t.text.replace(/\n {4,}(?=[*+-] )/g,'\n');
        items.push({children,task:task?task[1]!==' ':null});j=k; if(tail&&!next){j=k-tail;break;}
      }
      if(items.length) {out.push({type:'list',ordered,start:ordered?parseInt(b[2]):1,loose:loose||items.some(x=>x.children.some((y,n)=>y.type==='space'&&n>0&&n<x.children.length-1)),items});i=j;continue;}
    }
    const hk=(sp||bc===60)&&htmlKind(line);
    if(hk) {
      let body=[],j=i; const rawtag=hk===1? /^ {0,3}<(\w+)/.exec(line)[1]:'';
      const end=hk===1?new RegExp('</'+rawtag+'>','i'):hk===2?/-->/:hk===3?/\?>/:hk===4?/>/:hk===5?/\]\]>/:null;
      while(j<lines.length) {if(!end&&!lines[j].trim())break;body.push(lines[j]);j++;if(end&&end.test(body.at(-1)))break;}
      out.push({type:'html',text:body.join('\n')+((j<lines.length&&lines[j]!==''&&(end||!/^[ \t]+$/.test(lines[j])))||j===lines.length&&source.endsWith('\n')?'\n':'')});i=j;continue;
    }
    const defsrc=(sp||bc===91)?lines.slice(i).join('\n'):'';
    const def=/^ {0,3}\[((?:\\.|[^\[\]\\])+?)\]:[ \t]*(?:\n[ \t]*)?(?:<((?:\\.|[^<>\\\n])*)>|((?!<)(?:\\.|[^\s\\])+))(?:(?:[ \t]*\n[ \t]*|[ \t]+)(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\)))?[ \t]*(?:\n|$)/.exec(defsrc);
    if(def && norm(def[1]) && !/\n[ \t]*\n/.test(def[0])) {
      const key=norm(def[1]);
      if(!refs.has(key))refs.set(key,{href:unescape(def[2]??def[3]),title:unescape(def[4]??def[5]??def[6]??'')});
      i+=def[0].split('\n').length-(def[0].endsWith('\n')?1:0);continue;
    }
    if(i+1<lines.length) {
      const delim=lines[i+1];
      if(line.includes('|') && delim.indexOf('-')>=0 && /^ {0,3}\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/.test(delim)) {
        const head=cells(line), align=cells(delim);
        if(head.length===align.length) {
          const rows=[];let j=i+2;
          while(j<lines.length&&lines[j]!==''&&!/^[ ]+$/.test(lines[j])&&!interrupts(lines[j])) {const row=cells(lines[j]);row.length=Math.min(row.length,head.length);while(row.length<head.length)row.push('');rows.push(row);j++;}
          out.push({type:'table',head,align:align.map(x=>x.startsWith(':')&&x.endsWith(':')?'center':x.endsWith(':')?'right':x.startsWith(':')?'left':null),rows});i=j;continue;
        }
      }
    }
    let text=[line],j=i+1,depth=0;
    while(j<lines.length&&(lines[j].trim()||j===lines.length-1&&lines[j]!=='')) {
      if(/^ {0,3}(=+|-+)[ \t]*$/.test(lines[j])) {depth=lines[j].trim()[0]==='='?1:2;j++;break;}
      if(interrupts(lines[j],!top))break;
      text.push(lines[j]);j++;
    }
    out.push({type:depth?'heading':top?'paragraph':'text',depth,text:depth?text.join('\n').trim():text.join('\n')});i=j;
  }
  return out;
}
function destination(src, start) {
  let i=start;while(/\s/.test(src[i]||'')&&i<src.length)i++;
  let href='',title='';
  if(src[i]==='<') {let j=i+1;while(j<src.length&&src[j]!=='>'&&src[j]!=='\n'){if(src[j]==='\\'&&j+1<src.length)j++;j++;}if(src[j]!=='>')return null;href=src.slice(i+1,j);i=j+1;}
  else {let begin=i,n=0;while(i<src.length){const c=src[i];if(c==='\\'&&i+1<src.length){i+=2;continue;}if(c==='(')n++;else if(c===')'){if(!n)break;n--;}if(/[ \t\n\r]/.test(c)&&!n)break;i++;}if(n)return null;href=src.slice(begin,i);}
  const before=i;while(i<src.length&&/[ \t\n\r]/.test(src[i]))i++;
  if(i>before && /["'(]/.test(src[i]||'')&&src[i]) {const open=src[i],end=open==='('?')':open;let j=++i;while(j<src.length&&src[j]!==end){if(src[j]==='\\')j++;j++;}if(j===src.length)return null;title=src.slice(i,j);i=j+1;while(i<src.length&&/\s/.test(src[i]))i++;}
  if(src[i]!==')')return null;
  return {href:unescape(href),title:unescape(title),end:i+1};
}
let flowLink=false, flowRaw=false;
const plainTest=/[\\<[!*_`~@]|&#|www\.|https?:\/\/|ftp:\/\/|mailto:|xmpp:|  \n/i;
function inline(src, refs, inLink=flowLink, raw=flowRaw) {
  if(!raw&&!plainTest.test(src)){flowLink=inLink;flowRaw=raw;return [{type:'text',text:src}];}
  const outer=arguments.length<=2;
  let emMaskEnd=0;const tokens=[]; const add=(type,text,extra={})=>tokens.push({type,text,...extra});let i=0;
  while(i<src.length) {
    const rest=src.slice(i),c=src[i];let m;
    if(c==='&' && (m=/^(?:&#(?:x[0-9a-f]{1,6}|[0-9]{1,7});|&[a-z][a-z0-9]*;)/i.exec(rest))){add('text',m[0]);i+=m[0].length;continue;}
    if((m=/^\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/.exec(rest))) {add('escaped',m[1]);i+=m[0].length;continue;}
    if((m=/^(?: {2,}|\\)\n/.exec(rest))) {add('br','');i+=m[0].length;while(src[i]===' ')i++;continue;}
    if(c==='`') {const run=/^`+/.exec(rest)[0];let j=i+run.length,end=-1;while(j<src.length){j=src.indexOf('`',j);if(j<0)break;const n=/^`+/.exec(src.slice(j))[0].length;if(n===run.length){end=j;break;}j+=n;}if(end>=0){let text=src.slice(i+run.length,end).replace(/\n/g,' ');if(/^ .* $/.test(text)&&/[^ ]/.test(text))text=text.slice(1,-1);add('code',text);i=end+run.length;continue;}add('text',run);i+=run.length;continue;}
    if(c==='<' && (m=/^<([A-Za-z][A-Za-z\d+.-]{1,31}:[^\s<>]*|[A-Za-z\d.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?(?:\.[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?)*)>/.exec(rest))) {const mail=!/^[A-Za-z][\w+.-]*:/.test(m[1]);add('link','',{href:(mail?'mailto:':'')+m[1],title:'',children:[{type:'text',text:m[1]}]});i+=m[0].length;continue;}
    if(c==='<' && !/^<\/?[A-Za-z][\w-]*:/.test(rest)&&!/^<\/[^>]+\s+[^>]+>/.test(rest) && (m=tagRe.exec(rest))) {add('html',m[0]);if(/^<a\s/i.test(m[0]))inLink=true;if(/^<\/a\s*>/i.test(m[0]))inLink=false;if(/^<(?:pre|code|kbd|script)(?:\s|>)/i.test(m[0]))raw=true;if(/^<\/(?:pre|code|kbd|script)>/i.test(m[0]))raw=false;i+=m[0].length;continue;}
    if((c==='[' || c==='!'&&src[i+1]==='[')) {
      const image=c==='!',open=i+(image?1:0);let j=open+1,depth=1,literalEnd=0;
      for(;j<src.length;j++){if(src[j]==='<' ){const tag=tagRe.exec(src.slice(j))||/^<[^\s<>]+>/.exec(src.slice(j));if(tag){j+=tag[0].length-1;continue;}}if(src[j]==='\\'){j++;continue;}if(src[j]==='`'&&j>=literalEnd){let r=/^`+/.exec(src.slice(j))[0],k=src.indexOf(r,j+r.length),br=src.indexOf(']',j+r.length);if(r.length>1&&br>=0&&src.slice(j+r.length,br).includes('`')&&(k<0||k>br)){literalEnd=br;j+=r.length-1;continue;}if(k>=0){j=k+r.length-1;continue;}}if(src[j]==='[')depth++;if(src[j]===']'&&!--depth)break;}
      if(j<src.length) {
        const label=src.slice(open+1,j);let link=null,end=j+1;
        if(src[end]==='(') {link=destination(src,end+1);if(link)end=link.end;}
        if(!link) {let id=label;if(src[end]==='['){const k=src.indexOf(']',end+1);if(k>=0){id=src.slice(end+1,k)||label;end=k+1;}}link=refs.get(norm(id));}
        const codeLabel=/(`{2,})([\s\S]*?)\1/.exec(label);const badCode=codeLabel&&codeLabel[2].includes('`')&&label.slice(codeLabel.index+codeLabel[0].length).length>0;if(badCode)emMaskEnd=j+1;
        if(link && !badCode && (image||!hasExplicitLink(label,refs))) {
          const stray=!codeLabel&&/(`{2,})[^`]*`(?!`)/.exec(label);if(stray){const later=src.indexOf(stray[1],end),single=src.indexOf('`',end);if(later>=0)emMaskEnd=Math.max(emMaskEnd,later+stray[1].length);else if(single>=0)emMaskEnd=Math.max(emMaskEnd,single+1);}
const priorLink=inLink;const children=inline(label,refs,true,raw);inLink=priorLink;raw=flowRaw;add(image?'image':'link',label,{href:link.href,title:link.title,children});i=end;continue;}
      }
    }
    if(!inLink&&!raw && (m=/^(?:(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/|www\.)[^\s<]+/.exec(rest))) {
      let url=m[0],old;
      const tail=/^(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![A-Za-z\d]+;$)|[?!.,:;*_'"~)]+(?!$))+/;
      do{old=url;url=tail.exec(url)?.[0]||'';}while(url!==old);
      if(url){add('link','',{href:/^www\./i.test(url)?'http://'+url:url,title:'',children:[{type:'text',text:url}]});i+=url.length;continue;}
    }
    if(!inLink&&!raw && (i===0||!/[A-Za-z\d._+-]/.test(src[i-1])) && (m=/^(?:mailto:|xmpp:)?[A-Za-z\d._+-]+@(?:[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?\.)+[A-Za-z]+(?![A-Za-z\d-])/.exec(rest))) {
      let email=m[0];if(src[i+email.length]==='_'&&!tokens.some(t=>t.type==='delimiter'&&t.char==='_'&&t.open)){add('text',c);i++;continue;}if(email.startsWith('xmpp:')){const resource=/^\/[A-Za-z\d@._+-]+/.exec(src.slice(i+email.length));if(resource)email+=resource[0];}
      add('link','',{href:/^(?:mailto:|xmpp:)/.test(email)?email:'mailto:'+email,title:'',children:[{type:'text',text:email}]});i+=email.length;continue;
    }
    if((c==='*'||c==='_')&&!raw&&i>=emMaskEnd) {
      let n=1;while(src[i+n]===c)n++;const prev=src[i-1]||'',next=src[i+n]||'';
      const left=!white(next)&&(!punct(next)||white(prev)||punct(prev));const right=!white(prev)&&(!punct(prev)||white(next)||punct(next));
      add('delimiter',c.repeat(n),{char:c,n,open:left&&(c!=='_'||!right||punct(prev)),close:right&&(c!=='_'||!left||punct(next))});i+=n;continue;
    }
    if(c==='~'&&!raw){let n=1;while(src[i+n]==='~')n++;add(n<=2?'delimiter':'text','~'.repeat(n),{char:'~',n,open:!white(src[i+n]),close:!white(src[i-1])});i+=n;continue;}
    add(raw?'html':'text',c);i++;
  }
  for(let j=0;j<tokens.length;j++) {
    let close=tokens[j];if(close.type!=='delimiter'||!close.close)continue;
    for(let k=j-1;k>=0;k--) {
      const open=tokens[k];if(open.type!=='delimiter'||!open.open||open.char!==close.char)continue;
      if(open.char==='~'&&open.n!==close.n)continue;
      if(open.char!=='~'&&(open.close||close.open)&&(open.n+close.n)%3===0&&(open.n%3!==0||close.n%3!==0))continue;
      if(open.char!=='~'&&open.n===1&&tokens.slice(k+1,j).some(t=>t.dualChar===open.char&&t.dualCount===2&&t.pureOpen))continue;
      if(open.char!=='~'&&open.n===2&&close.n===1&&tokens.slice(j+1).some(t=>t.type==='delimiter'&&t.char===open.char&&t.close&&t.n>=2))continue;
      const use=open.n>=2&&close.n>=2?2:1;
      const inner=tokens.slice(k+1,j);const extra=open.char!=='~'&&open.n===2&&close.n===3&&inner.some(t=>t.dualChar===open.char&&t.dualCount===1);if(extra)inner.push({type:'text',text:close.char});const node={type:open.char==='~'?'del':use===2?'strong':'em',children:inner,text:'',dualChar:close.open&&close.close?close.char:null,dualCount:close.n,pureOpen:!open.close};
      open.n-=use;open.text=open.char.repeat(open.n);close.n-=use+(extra?1:0);close.text=close.char.repeat(close.n);
      const insert=[];if(open.n)insert.push(open);insert.push(node);if(close.n)insert.push(close);
      tokens.splice(k,j-k+1,...insert);j=k+(open.n?1:0)+(close.n?1:0);close=tokens[j];if(close?.type==='delimiter'&&close.close){j--;}
      break;
    }
  }
  const merged=[];for(const t of tokens){if((t.type==='text'||t.type==='html')&&merged.at(-1)?.type===t.type)merged.at(-1).text+=t.text;else merged.push(t);}flowLink=inLink;flowRaw=raw;return merged;
}
function hasExplicitLink(s,refs){
  const rx=/!?\[((?:\\.|[^\[\]])*)\](?:\([^)]*\)|\[([^\[\]]*)\])?/g; let m;
  while((m=rx.exec(s))){if(m[0][0]==='!')continue;if(m[0].includes('](')||m[2]!==undefined&&refs.has(norm(m[2]||m[1]))||refs.has(norm(m[1])))return true;}return false;
}
function hasLink(ts){return ts.some(t=>t.type==='link'||t.children&&hasLink(t.children));}
function inlineText(ts){return ts.map(t=>t.children?inlineText(t.children):t.text).join('');}
function urlEncode(s) {try{return encodeURI(s).replace(/%25/g,'%');}catch{return null;}}
function renderInline(ts) {
  let out='';for(const t of ts) {
    switch(t.type) {
      case 'text':case 'delimiter':out+=escapeHtml(t.text);break;
      case 'escaped':out+=encode(t.text);break;
      case 'html':out+=t.text;break;
      case 'code':out+='<code>'+encode(t.text)+'</code>';break;
      case 'br':out+='<br>';break;
      case 'em':case 'strong':case 'del':out+='<'+t.type+'>'+renderInline(t.children)+'</'+t.type+'>';break;
      case 'link':case 'image': {const href=urlEncode(t.href);if(href===null){out+=renderInline(t.children);break;}const title=t.title?' title="'+escapeHtml(t.title)+'"':'';out+=t.type==='link'?'<a href="'+escapeHtml(href)+'"'+title+'>'+renderInline(t.children)+'</a>':'<img src="'+escapeHtml(href)+'" alt="'+escapeHtml(inlineText(t.children))+'"'+title+'>';break;}
    }
  }return out;
}
function prepare(tokens,refs) {
  for(const t of tokens) {
    if(['heading','paragraph','text'].includes(t.type))t.inline=inline(t.text,refs);
    if(t.children)prepare(t.children,refs);
    if(t.items)for(const item of t.items)prepare(item.children,refs);
    if(t.type==='table'){t.head=t.head.map(x=>inline(x,refs));t.rows=t.rows.map(row=>row.map(x=>inline(x,refs)));}
  }
}
function render(tokens,tight=false) {
  let out='';for(let i=0;i<tokens.length;i++) {const t=tokens[i];switch(t.type) {
    case 'space':break;
    case 'hr':out+='<hr>\n';break;
    case 'code':out+='<pre><code'+(t.lang?' class="language-'+escapeHtml(t.lang)+'"':'')+'>'+encode(t.text.replace(/\n$/, ''))+(t.text?'\n':'')+'</code></pre>\n';break;
    case 'html':out+=t.text;break;
    case 'heading':out+='<h'+t.depth+'>'+renderInline(t.inline)+'</h'+t.depth+'>\n';break;
    case 'paragraph':case 'text': {let text=renderInline(t.inline);while(tokens[i+1]?.type==='text'){text+='\n'+renderInline(tokens[++i].inline);}out+=tight?text:'<p>'+text+'</p>\n';break;}
    case 'quote':out+='<blockquote>\n'+render(t.children)+'</blockquote>\n';break;
    case 'list': {const tag=t.ordered?'ol':'ul';out+='<'+tag+(t.ordered&&t.start!==1?' start="'+t.start+'"':'')+'>\n';for(const item of t.items){let body=render(item.children,!t.loose);if(item.task!==null){const box='<input '+(item.task?'checked="" ':'')+'disabled="" type="checkbox">';if(t.loose){if(body.startsWith('<p>'))body='<p>'+box+' '+body.slice(3);else body=box+' '+body;}else body=box+' '+body;}out+='<li>'+body+'</li>\n';}out+='</'+tag+'>\n';break;}
    case 'table': {out+='<table>\n<thead>\n<tr>\n';for(let k=0;k<t.head.length;k++)out+='<th'+(t.align[k]?' align="'+t.align[k]+'"':'')+'>'+renderInline(t.head[k])+'</th>\n';out+='</tr>\n</thead>\n';if(t.rows.length){out+='<tbody>';for(const row of t.rows){out+='<tr>\n';for(let k=0;k<row.length;k++)out+='<td'+(t.align[k]?' align="'+t.align[k]+'"':'')+'>'+renderInline(row[k])+'</td>\n';out+='</tr>\n';}out+='</tbody>';}out+='</table>\n';break;}
  }}return out;
}
export function parse(markdown) {
  flowLink=false;flowRaw=false;const refs=new Map();const tree=blocks(markdown.replace(/\r\n?|\u2424/g,'\n'),refs);prepare(tree,refs);return render(tree);
}
