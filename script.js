const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');
const cellSize = 20; // 1マスのサイズ(px)
const offset = 10; // キャンバス端の描画欠けを防ぐ余白
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // 北, 東, 南, 西の方向増分
const storageName = 'expert_mapper';


let mapWidth = 20;
let mapHeight = 20;

let player = { x: 0, y: 19, dir: 0 }; 
let visited, wallMap, memoMap, darkMap, stoneMap;
let links = [];
let linkStart = null;

// マップデータの配列を初期化・拡張する
function initArrays(w, h) {
    let newVisited = Array.from({ length: w }, () => Array(h).fill(false));
    let newWallMap = Array.from({ length: w }, () => Array.from({ length: h }, () => Array(4).fill(0)));
    let newMemoMap = Array.from({ length: w }, () => Array(h).fill(""));
    let newDarkMap = Array.from({ length: w }, () => Array(h).fill(false));
    let newStoneMap = Array.from({ length: w }, () => Array(h).fill(false));

    // 既存データがある場合は新しい配列へコピーしてサイズ変更に対応
    if (visited) {
        for (let x = 0; x < Math.min(visited.length, w); x++) {
            for (let y = 0; y < Math.min(visited[0].length, h); y++) {
                newVisited[x][y] = visited[x][y];
                newWallMap[x][y] = wallMap[x][y];
                newMemoMap[x][y] = memoMap[x][y];
                newDarkMap[x][y] = darkMap[x][y];
                if(stoneMap && stoneMap[x] && stoneMap[x][y] !== undefined) {
                    newStoneMap[x][y] = stoneMap[x][y];
                }
            }
        }
    }

    visited = newVisited;
    wallMap = newWallMap;
    memoMap = newMemoMap;
    darkMap = newDarkMap;
    stoneMap = newStoneMap;
}

initArrays(mapWidth, mapHeight);

// ローカルストレージに現在の状態を保存
function saveData() { 
    localStorage.setItem(storageName, JSON.stringify({ player, visited, wallMap, memoMap, darkMap, stoneMap, links, mapWidth, mapHeight })); 
}

// ローカルストレージからデータを読み込み復元する
function loadData() {
    const saved = localStorage.getItem(storageName);
    if (saved) {
        const p = JSON.parse(saved);
        
        mapWidth = p.mapWidth || (p.wallMap ? p.wallMap.length : 20);
        mapHeight = p.mapHeight || (p.wallMap && p.wallMap[0] ? p.wallMap[0].length : 20);
        
        document.getElementById('mapWidthInput').value = mapWidth;
        document.getElementById('mapHeightInput').value = mapHeight;
        
        initArrays(mapWidth, mapHeight);
        
        player = p.player; 
        visited = p.visited || visited; 
        wallMap = p.wallMap || wallMap; 
        memoMap = p.memoMap || memoMap; 
        darkMap = p.darkMap || darkMap; 
        stoneMap = p.stoneMap || stoneMap;
        links = p.links || [];
        
        updateCanvasSize();
    }
}

// マップサイズに合わせてキャンバスの物理サイズを調整する
function updateCanvasSize() {
    const targetWidth = mapWidth * cellSize + offset * 2 + 1;
    const targetHeight = mapHeight * cellSize + offset * 2 + 1;
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    
    const elementsToResize = document.querySelectorAll('.status, textarea');
    elementsToResize.forEach(el => {
        el.style.width = targetWidth + 'px';
    });
}

// マップの端（ループ境界）に壁を描画する
function drawWallWraps(x, y, d, type) {
    const isWrapColor = (type === 4) ? false : true;

    if (x === 0) renderWallSymbol(x + mapWidth, y, d, type, isWrapColor);
    if (x === mapWidth - 1) renderWallSymbol(x - mapWidth, y, d, type, isWrapColor);
    if (y === 0) renderWallSymbol(x, y + mapHeight, d, type, isWrapColor);
    if (y === mapHeight - 1) renderWallSymbol(x, y - mapHeight, d, type, isWrapColor);
    
    if (x === 0 && y === 0) renderWallSymbol(mapWidth, mapHeight, d, type, isWrapColor);
    if (x === mapWidth - 1 && y === 0) renderWallSymbol(-1, mapHeight, d, type, isWrapColor);
    if (x === 0 && y === mapHeight - 1) renderWallSymbol(mapWidth, -1, d, type, isWrapColor);
    if (x === mapWidth - 1 && y === mapHeight - 1) renderWallSymbol(-1, -1, d, type, isWrapColor);
}

// 壁、扉、一方通行などのシンボルを具体的に描画する
function renderWallSymbol(gx, gy, dir, type, isWrap = false) {
    ctx.save();
    ctx.translate(gx * cellSize, gy * cellSize);
    // 指定された方向に合わせて座標系を回転
    if(dir === 1) { ctx.translate(cellSize, 0); ctx.rotate(Math.PI / 2); }
    if(dir === 2) { ctx.translate(cellSize, cellSize); ctx.rotate(Math.PI); }
    if(dir === 3) { ctx.translate(0, cellSize); ctx.rotate(Math.PI * 1.5); }
    
    const baseColor = isWrap ? "#005500" : "#0f0";
    ctx.strokeStyle = baseColor; 
    ctx.fillStyle = baseColor; 
    ctx.lineWidth = 2;
    
    if (type === 1) { 
        // 通常の壁
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(cellSize,0); ctx.stroke(); 
    }
    else if (type === 2) { 
        // 扉シンボル
        ctx.beginPath();
        ctx.moveTo(0, 0);                       ctx.lineTo(cellSize , 0);
        ctx.moveTo(cellSize * 0.3, -3);         ctx.lineTo(cellSize * 0.3, 3);
        ctx.moveTo(cellSize * 0.7, -3);         ctx.lineTo(cellSize * 0.7, 3);
        ctx.stroke();
    }
    else if (type === 3) { 
        // 隠し扉（外枠は緑、中心は赤）
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(cellSize , 0);
        ctx.stroke();

        ctx.save();
        ctx.strokeStyle = "#f00"; 
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo((cellSize * 0.25), 0); ctx.lineTo(cellSize - (cellSize * 0.25) , 0);
        ctx.stroke();
        ctx.restore();
   }
    else if (type === 4) {
        // 一方通行（矢印）
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(cellSize,0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cellSize/2, 6); ctx.lineTo(cellSize/2, -5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cellSize/2-4,-4); ctx.lineTo(cellSize/2+4,-4); ctx.lineTo(cellSize/2,-10); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
}

// 画面上部のステータス情報を更新
function updateStatus() {
    document.getElementById('pos').innerText = `POS: X${player.x}, Y${(mapHeight-1)-player.y} | DIR: ${["NORTH","EAST","SOUTH","WEST"][player.dir]}`;
    const fx = player.x + DX[player.dir], fy = player.y + DY[player.dir];
    const fMemo = (fx>=0 && fx<mapWidth && fy>=0 && fy<mapHeight) ? memoMap[fx][fy] : "OUT";
    document.getElementById('memoDisplay').innerText = `FRONT: ${fMemo || "-"}`;
}

// メインの描画ループ
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset, offset); 

    // グリッド（背景網目）の描画
    for(let i=0; i<=mapWidth; i++){
        ctx.strokeStyle = (i === 0 || i === mapWidth) ? "#004400" : "#001500";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(i*cellSize, 0); ctx.lineTo(i*cellSize, mapHeight * cellSize); ctx.stroke();
    }
    for(let i=0; i<=mapHeight; i++){
        ctx.strokeStyle = (i === 0 || i === mapHeight) ? "#004400" : "#001500";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, i*cellSize); ctx.lineTo(mapWidth * cellSize, i*cellSize); ctx.stroke();
    }

    // 各セルの床情報の描画
    for(let x=0; x<mapWidth; x++) {
        for(let y=0; y<mapHeight; y++) {
            if(stoneMap[x][y]) {
                // 石壁（埋まった場所）
                ctx.fillStyle = "#0A0"; 
                ctx.fillRect(x*cellSize, y*cellSize, cellSize, cellSize);
                ctx.save(); ctx.beginPath(); ctx.rect(x*cellSize, y*cellSize, cellSize, cellSize); ctx.clip();
                ctx.stroke(); ctx.restore();
            } else if(darkMap[x][y]) {
                // ダークゾーン（斜線）
                ctx.fillStyle = "#777"; ctx.fillRect(x*cellSize, y*cellSize, cellSize, cellSize);
                ctx.save(); ctx.beginPath(); ctx.rect(x*cellSize, y*cellSize, cellSize, cellSize); ctx.clip();
                ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
                for(let o=-cellSize; o<=cellSize*2; o+=6){ ctx.moveTo(x*cellSize+o, y*cellSize); ctx.lineTo(x*cellSize+o+cellSize, y*cellSize+cellSize); }
                ctx.stroke(); ctx.restore();
            } else if(visited[x][y]) {
                // 踏破済みタイル
                ctx.fillStyle = "#001a00"; ctx.fillRect(x*cellSize, y*cellSize, cellSize, cellSize);
            }
            // メモ/特殊タイトルの略称（罠、転など）
            const text = memoMap[x][y];
            if(text) {
                ctx.font = "bold 11px 'DotGothic16'"; ctx.textAlign = "center";
                ctx.fillStyle = (text==="罠")?"#f33":(text==="転")?"#f3f":"#3ff";
                ctx.fillText((text==="上")?"U":(text==="下")?"D":text.substring(0,1), x*cellSize+10, y*cellSize+14);
            }
        }
    }

    // ワープ線の描画
    ctx.save(); ctx.strokeStyle = "rgba(255, 255, 0, 0.5)"; ctx.setLineDash([4, 2]);
    links.forEach(l => {
        ctx.beginPath(); ctx.moveTo(l.fx*20+10, l.fy*20+10); ctx.lineTo(l.tx*20+10, l.ty*20+10); ctx.stroke();
        ctx.fillStyle = "#ff0"; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(l.tx*20+10, l.ty*20+10, 2, 0, 7); ctx.fill();
    }); ctx.restore();

    // 壁の描画（先にループ用（薄い色）、次にメイン（濃い色）を上書き）
    for(let x=0; x<mapWidth; x++) {
        for(let y=0; y<mapHeight; y++) {
            for(let d=0; d<4; d++) {
                if(wallMap[x][y][d]) drawWallWraps(x, y, d, wallMap[x][y][d]);
            }
        }
    }
    for(let x=0; x<mapWidth; x++) {
        for(let y=0; y<mapHeight; y++) {
            for(let d=0; d<4; d++) {
                if(wallMap[x][y][d]) renderWallSymbol(x, y, d, wallMap[x][y][d], false);
            }
        }
    }

    // 自機（プレイヤー）の描画
    ctx.save(); ctx.translate(player.x*cellSize+10, player.y*cellSize+10); ctx.rotate((player.dir*90)*Math.PI/180);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(5,5); ctx.lineTo(-5,5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    updateStatus();
}

/**
 * 指定した座標から壁に囲まれた範囲を塗りつぶす（シードフィル）
 * @param {number} startX 開始X座標
 * @param {number} startY 開始Y座標
 */
function fillVisitedArea(startX, startY) {
    // 既に塗りつぶしたい対象（未踏破）でない場合は何もしない
    if (visited[startX][startY] && !stoneMap[startX][startY]) {
        // もし「踏破済みを未踏破に戻す」用途で使いたい場合は条件を変えますが、
        // 今回は「未踏破を埋める」目的なので、未踏破タイルのみを起点にします。
    }

    const queue = [[startX, startY]];
    const targetState = !visited[startX][startY]; // クリックした地点の状態を反転させる

    while (queue.length > 0) {
        const [x, y] = queue.shift();

        // 範囲外チェック
        if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) continue;
        // 既に処理済み（目的の状態）ならスキップ
        if (visited[x][y] === targetState) continue;
        // 石壁（埋まった場所）は貫通しない
        if (stoneMap[x][y]) continue;

        // 現在のタイルを塗りつぶす
        visited[x][y] = targetState;

        // 4方向（北、東、南、西）に対して、壁がなければ隣接セルをキューに追加
        for (let d = 0; d < 4; d++) {
            // wallMap[x][y][d] が 0 (壁なし) または 4 (一方通行) の場合は通過可能とする
            // 1:壁, 2:扉, 3:隠し扉 がある場合はそこを境界とする
            const wallType = wallMap[x][y][d];
            if (wallType === 0 || wallType === 4) {
                const nx = x + DX[d];
                const ny = y + DY[d];
                
                // 隣接がマップ範囲内であること（ループ構造は考慮せず、現在の1画面内を塗る仕様）
                if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
                    queue.push([nx, ny]);
                }
            }
        }
    }
    
    draw();
    saveData();
}


// 壁を配置・削除する（向かい合うセルの壁も同期させる）
function setWall(x, y, d, type) {
    const targetType = (wallMap[x][y][d] === type) ? 0 : type;
    wallMap[x][y][d] = targetType;
    const nx = (x + DX[d] + mapWidth) % mapWidth, ny = (y + DY[d] + mapHeight) % mapHeight;
    // 一方通行の場合は逆側からの壁は作成しない
    if (targetType === 4) wallMap[nx][ny][(d + 2) % 4] = 0;
    else wallMap[nx][ny][(d + 2) % 4] = targetType;
    draw(); saveData();
}

// マップサイズの適用ボタン処理
window.applyMapSize = function() {
    const w = parseInt(document.getElementById('mapWidthInput').value, 10);
    const h = parseInt(document.getElementById('mapHeightInput').value, 10);
    if(isNaN(w) || isNaN(h) || w < 5 || h < 5) {
        alert("無効なサイズです。5以上の数値を入力してください。");
        return;
    }
    mapWidth = w;
    mapHeight = h;
    initArrays(w, h);
    
    if(player.x >= w) player.x = w - 1;
    if(player.y >= h) player.y = h - 1;
    
    links = links.filter(l => l.fx < w && l.fy < h && l.tx < w && l.ty < h);
    
    updateCanvasSize();
    draw();
    saveData();
};

// データの書き出し
window.exportJSON = function() { 
    document.getElementById('jsonArea').value = JSON.stringify({wallMap, memoMap, visited, darkMap, stoneMap, links, mapWidth, mapHeight}); 
};

// データの読み込み
window.importJSON = function() {
    try {
        const area = document.getElementById('jsonArea');
        if (!area.value) return;
        const p = JSON.parse(area.value);

        // 各データを安全に流し込む（データがない場合は現在の値を維持）
        if (p.mapWidth && p.mapHeight) {
            mapWidth = p.mapWidth;
            mapHeight = p.mapHeight;
            initArrays(mapWidth, mapHeight);
            document.getElementById('mapWidthInput').value = mapWidth;
            document.getElementById('mapHeightInput').value = mapHeight;
        } else if (p.wallMap) {
            mapWidth = p.wallMap.length;
            mapHeight = p.wallMap[0].length;
            initArrays(mapWidth, mapHeight);
            document.getElementById('mapWidthInput').value = mapWidth;
            document.getElementById('mapHeightInput').value = mapHeight;
        }

        if (p.wallMap) wallMap = p.wallMap;
        if (p.memoMap) memoMap = p.memoMap;
        if (p.visited) visited = p.visited;
        if (p.darkMap) darkMap = p.darkMap;
        if (p.stoneMap) stoneMap = p.stoneMap;
        if (p.links)   links   = p.links;
        if (p.player)  player  = p.player;
        
        updateCanvasSize();
        draw(); 
        saveData();
        console.log("JSON Import Success");
    } catch (e) {
        console.error("Import Error Detail:", e);
        alert("読み込みに失敗しました。");
    }
};

// キャンバスを画像として保存
window.saveAsImage = function() { 
    const link = document.createElement('a'); 
    link.download = 'exp_map.png'; 
    link.href = canvas.toDataURL(); 
    link.click(); 
};

// 全データの消去とリセット
window.fullReset = function() { 
    if(confirm("全データをリセッットしますか？")) { 
        localStorage.clear(); 
        location.reload(); 
    } 
};

// キーボード入力イベント
window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;

    const k = e.key, wk = k.toLowerCase();
    
    // メモ入力
    if(wk === "m") {
        const v = prompt("MEMO:", memoMap[player.x][player.y]);
        if(v !== null) { memoMap[player.x][player.y] = v; draw(); saveData(); }
        return;
    }
    
    // 移動操作 (WASD / QE)
    if(["w","s","q","e","a","d"].includes(wk)){
        let nx = player.x, ny = player.y;
        if(wk==="w"){ nx+=DX[player.dir]; ny+=DY[player.dir]; }
        if(wk==="s"){ nx-=DX[player.dir]; ny-=DY[player.dir]; }
        if(wk==="q"){ let qd=(player.dir+3)%4; nx+=DX[qd]; ny+=DY[qd]; }
        if(wk==="e"){ let ed=(player.dir+1)%4; nx+=DX[ed]; ny+=DY[ed]; }
        if(wk==="a") player.dir=(player.dir+3)%4;
        if(wk==="d") player.dir=(player.dir+1)%4;
        player.x=(nx+mapWidth)%mapWidth; player.y=(ny+mapHeight)%mapHeight;
        visited[player.x][player.y]=true; draw(); saveData();
    }
    
    // 壁のクイック設置 (テンキー)
    if(wk==="8") setWall(player.x, player.y, player.dir, 1);
    if(wk==="4") setWall(player.x, player.y, (player.dir+3)%4, 1);
    if(wk==="6") setWall(player.x, player.y, (player.dir+1)%4, 1);
    if(wk==="5") setWall(player.x, player.y, (player.dir+2)%4, 1);
    
    // 扉の切替 (テンキー 0)
    if(wk==="0") setWall(player.x, player.y, player.dir, (wallMap[player.x][player.y][player.dir]+1)%5);
    
    // ダークゾーン/石壁切替
    if(k==="7"){ darkMap[player.x][player.y]=!darkMap[player.x][player.y]; draw(); saveData(); }
    if(k==="9"){ stoneMap[player.x][player.y]=!stoneMap[player.x][player.y]; draw(); saveData(); }

    // 現在地の情報消去
    if (wk === "c") {
        memoMap[player.x][player.y] = "";
        visited[player.x][player.y] = false;
        draw();
        saveData();
        return;
    }

    // 階段・罠などのスタンプ設置 (矢印キー)
    if(k.startsWith("Arrow") && !e.shiftKey){
        let m = (k==="ArrowUp")?"上":(k==="ArrowDown")?"下":(k==="ArrowLeft")?"罠":"転";
        memoMap[player.x][player.y] = (memoMap[player.x][player.y]===m)?"":m;
        draw(); saveData();
    }
    
    // ワープ線一括消去
    if(wk==="l"){ if(confirm("Clear Lines?")){links=[]; draw(); saveData();} }
    
    // マップ全体のスクロール (Shift + 矢印キー)
    if( e.shiftKey && k.startsWith("Arrow")) {
        const sx = (k === "ArrowLeft") ? -1 : (k === "ArrowRight") ? 1 : 0;
        const sy = (k === "ArrowUp") ? -1 : (k === "ArrowDown") ? 1 : 0;
        const oldW=JSON.parse(JSON.stringify(wallMap)), oldM=JSON.parse(JSON.stringify(memoMap)), oldV=JSON.parse(JSON.stringify(visited)), oldD=JSON.parse(JSON.stringify(darkMap)), oldS=JSON.parse(JSON.stringify(stoneMap));
        for(let x=0; x<mapWidth; x++) for(let y=0; y<mapHeight; y++) {
            let nx=(x+sx+mapWidth)%mapWidth, ny=(y+sy+mapHeight)%mapHeight;
            wallMap[nx][ny]=oldW[x][y]; memoMap[nx][ny]=oldM[x][y]; visited[nx][ny]=oldV[x][y]; darkMap[nx][ny]=oldD[x][y]; stoneMap[nx][ny]=oldS[x][y];
        }
        player.x=(player.x+sx+mapWidth)%mapWidth; player.y=(player.y+sy+mapHeight)%mapHeight;
        draw(); saveData();
    }
});

// マウス移動時の座標追跡
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left - offset) / cellSize);
    const gy = Math.floor((e.clientY - rect.top - offset) / cellSize);

    // 範囲内にいるか判定
    if (gx >= 0 && gx < mapWidth && gy >= 0 && gy < mapHeight) {
        canvas.style.cursor = 'crosshair'; // 範囲内は十字
        document.getElementById('hoverPos').innerText = `CURSOR: X${gx}, Y${(mapHeight-1) - gy} ${memoMap[gx][gy] ? '[' + memoMap[gx][gy] + ']' : ''}`;
    } else {
        canvas.style.cursor = 'default'; // 範囲外は矢印
        document.getElementById('hoverPos').innerText = `CURSOR: OUTSIDE`;
    }
});

// キャンバスからマウスが完全に離れた時の処理
canvas.addEventListener('mouseleave', () => {
    canvas.style.cursor = 'default';
    document.getElementById('hoverPos').innerText = `CURSOR: OUTSIDE`;
});

// マウスクリックによる移動とワープ線設置
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left - offset) / cellSize);
    const gy = Math.floor((e.clientY - rect.top - offset) / cellSize);

    if (gx >= 0 && gx < mapWidth && gy >= 0 && gy < mapHeight) {
        if (e.ctrlKey || e.metaKey) {
            // Shift+クリック: ワープ線 (既存)
            if (!linkStart) {
                linkStart = { fx: gx, fy: gy };
            } else {
                if (linkStart.fx !== gx || linkStart.fy !== gy) {
                    links.push({ ...linkStart, tx: gx, ty: gy });
                }
                linkStart = null;
            }
        } else if (e.shiftKey) {
            // ★追加: Ctrl(またはCommand)+クリックで塗りつぶし
            fillVisitedArea(gx, gy);
            return; // 塗りつぶし時はプレイヤーのジャンプはさせない
        } else {
            // 通常クリック：プレイヤーをジャンプ (既存)
            player.x = gx;
            player.y = gy;
            visited[gx][gy] = true;
        }
        draw();
        saveData();
    }
});



// アプリの起動処理
updateCanvasSize();
loadData(); 
visited[player.x][player.y] = true; 
draw();
