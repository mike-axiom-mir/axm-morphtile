const MT = require('../core/morphtile.js'), png = require('./png.js'), fs = require('fs');
const ws = MT.createWorkspace(MT.seedWorld());
MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'press' }); MT.act(ws, { do: 'signal', tile: 'mt_rover', name: 'drive' }); MT.act(ws, { do: 'tick', dt: 3 });
const t0 = Date.now(), f = MT.renderAsset(ws.live, { width: 720, height: 600, camera: { yaw: 0.7, pitch: 0.3, dist: 19 } });
fs.writeFileSync(process.argv[2] || '/tmp/shot.png', png.encode(f.width, f.height, f.pixels)); console.log('render ms', Date.now() - t0, JSON.stringify(f.stats), MT.renderReceipt(f).sha256.slice(0, 16));
