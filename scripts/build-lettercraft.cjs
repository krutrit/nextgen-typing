// Assemble the editable game sources into the single deployable HTML file.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const file = path.join(root, 'index.html');
const original = read('index.html');
let html = original;
function replace(start, end, replacement, includeEnd = true) {
    const a = html.indexOf(start), b = html.indexOf(end, a);
    if (a < 0 || b < 0) throw new Error('Missing game bundle anchors: ' + start);
    html = html.slice(0,a) + replacement.trimEnd() + html.slice(b + (includeEnd ? end.length : 0));
}
const css = read('src/lettercraft/style.css'), ui = read('src/lettercraft/ui.html');
const js = '// LETTERCRAFT_SCRIPT_START\n' + ['core.js','view.js','bridge.js'].map(f=>read('src/lettercraft/'+f)).join('\n') + '\n// LETTERCRAFT_SCRIPT_END\n';
if (html.includes('/* LETTERCRAFT_STYLE_START */')) replace('/* LETTERCRAFT_STYLE_START */','/* LETTERCRAFT_STYLE_END */',css);
else replace('        /* ===== Letter Tower Climb 2.5D ===== */','    </style>',css+'\n',false);
if (html.includes('    <!-- LETTERCRAFT_UI_START -->')) replace('    <!-- LETTERCRAFT_UI_START -->','    <!-- LETTERCRAFT_UI_END -->',ui);
else replace('    <!-- Letter Tower Climb Game UI (2.5D Physics Engine) -->','<script>',ui+'\n\n',false);
if (html.includes('// LETTERCRAFT_SCRIPT_START')) replace('// LETTERCRAFT_SCRIPT_START','// LETTERCRAFT_SCRIPT_END',js);
else replace('    // =========================================================================\n    // --- 2.5D PHYSICS-BASED LETTER TOWER CLIMB ENGINE ---','    // --- KEYBOARD RENDERING & VISUALS ---',js+'\n',false);
html = html.replace('🌳 เล่นเกมปีนหอคอยตัวอักษร','🌳 เล่นเกมนักสำรวจโลกอักษร');
html = html.replace('// Game State (Letter Tower Climb)', '// Game State (Lettercraft Adventure)');
html = html.replace('        climb: null,\n', '');
html = html.replace("        window.addEventListener('resize', () => {\n            if(state.isGameMode && typeof climbOnResize === 'function') climbOnResize();\n        });",'');
html = html.replace("    function focusInput(e) {\n", "    function focusInput(e) {\n        if (state.isGameMode) return;\n").replace(/(        if \(state.isGameMode\) return;\n){2,}/g, '        if (state.isGameMode) return;\n');
const oldHandler = "    function handleGlobalKeydown(e) {\n        if ((e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') && e.target.id !== 'hidden-input') return;\n        if(state.isGameMode) handleGameInput(e); else handleTyping(e);\n    }";
html = html.replace(oldHandler,"    function handleGlobalKeydown(e) {\n        if (state.isGameMode) { handleGameInput(e); return; }\n        if ((e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') && e.target.id !== 'hidden-input') return;\n        handleTyping(e);\n    }");
if (process.argv.includes('--check')) {
    if (html !== original) { console.error('index.html is stale; run node scripts/build-lettercraft.cjs'); process.exitCode = 1; }
    else console.log('Single-file game bundle is up to date.');
} else { fs.writeFileSync(file, html); console.log('Bundled Lettercraft into index.html (' + Buffer.byteLength(html) + ' bytes)'); }
