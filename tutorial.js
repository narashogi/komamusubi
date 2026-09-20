"use strict";

// Illustrations reuse the game's actual board and rendered piece artwork.
const KomaTutorial = (() => {
  const pages = [
    ['① 同じ駒をくっつけよう', '同じ駒が2つくっつくと、ひとつ上の駒に変わるよ。どんどんくっつけて「玉」を目指そう！', 'merge'],
    ['② ラインを超えたら残り10秒', '積み上がった駒がラインを超えるとカウント開始。ラインを超えたまま10秒経つとゲームオーバー！', 'danger'],
    ['③ 「持ち駒」を活用しよう！', '持ち駒は、いつでも、何回でも使うことができるよ', 'hold'],
  ];
  let current = 0;
  const node = id => document.getElementById(id);
  function piece(tier, className='') {
    const img=document.createElement('img');img.src=piecePortrait(tier);
    img.alt=PIECES[tier].label;img.className='tutorial-piece '+className;return img;
  }
  function text(value,className='') {
    const span=document.createElement('span');span.textContent=value;span.className=className;return span;
  }
  function render() {
    const [title,description,kind]=pages[current];
    node('help-title').textContent=title;
    const lines={
      merge:['同じ駒が2つくっつくと、','ひとつ上の駒に変わるよ。','どんどんくっつけて','「玉」を目指そう！'],
      danger:['積み上がった駒が','ラインを超えるとカウント開始。','ラインを超えたまま','10秒経つとゲームオーバー！'],
      hold:['持ち駒は、いつでも、','何回でも使うことができるよ'],
    }[kind];
    node('help-description').replaceChildren(...lines.map((line,index)=>{
      const row=document.createElement('span');
      row.className='tutorial-copy-line'+(index===lines.length-1?' tutorial-copy-finish':'');
      for(const part of line.split(/(「玉」|10秒|持ち駒)/)){
        const highlight=/^(「玉」|10秒|持ち駒)$/.test(part);
        const segment=document.createElement(highlight?'strong':'span');
        segment.textContent=part;row.append(segment);
      }
      return row;
    }));
    node('help-progress').textContent=`${current+1} / ${pages.length}`;
    node('help-back').disabled=current===0;
    node('help-next').textContent=current===pages.length-1?'わかった！':'次へ';
    const scene=node('help-scene');scene.className='tutorial-scene tutorial-'+kind;
    scene.replaceChildren();
    scene.style.backgroundImage=`url("${KomaPieceAtlas.boardUrl}")`;
    if(kind==='merge') {
      scene.append(piece(0,'merge-left'),text('＋','merge-plus'),piece(0,'merge-right'),text('→','merge-arrow'),piece(1,'merge-result'));
    } else if(kind==='danger') {
      scene.append(piece(4,'tower-bottom'),piece(3,'tower-top'),text('','tutorial-line'),text('10 → 9 → 8…','tutorial-count'));
    } else if(kind==='aim') {
      scene.append(text('','tutorial-aim-line'),piece(0,'aim-piece'),text('↓','tutorial-down'),text('落とす','tutorial-action'));
    } else if(kind==='hold') {
      const now=document.createElement('div'),saved=document.createElement('div');
      now.className='tutorial-slot';saved.className='tutorial-slot saved';
      now.append(text('いま'),piece(0));saved.append(text('持ち駒'),piece(2));
      scene.append(now,text('⇄','tutorial-swap'),saved);
    } else {
      scene.append(piece(5,'rotate-before'),text('↻','tutorial-swap'),piece(5,'rotate-after'),text('回転','tutorial-action'));
    }
    const dots=node('help-dots');dots.replaceChildren(...pages.map((_,i)=>{
      const dot=document.createElement('span');dot.className=i===current?'active':'';return dot;
    }));
  }
  function reset(){current=0;render();}
  function next(){if(current===pages.length-1){node('help-close').click();return;}current++;render();}
  function back(){if(current>0){current--;render();}}
  node('help-next').addEventListener('click',next);
  node('help-back').addEventListener('click',back);
  return {reset,refresh:render};
})();
